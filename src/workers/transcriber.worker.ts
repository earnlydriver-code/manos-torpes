/// <reference lib="webworker" />
import { BasicPitch, noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch';
import * as tf from '@tensorflow/tfjs';
import type { RawNote } from '../corpus/midi-import';
// El modelo viaja empaquetado con la app (¿900 KB): nada que descargar de CDNs.
import modelJsonUrl from '@spotify/basic-pitch/model/model.json?url';
import weightsUrl from '@spotify/basic-pitch/model/group1-shard1of1.bin?url';

/**
 * Transcripción MP3/WAV → notas con Basic Pitch (Spotify) en un Web Worker
 * (spec §2): la UI no se congela aunque la inferencia tarde. El audio llega
 * ya decodificado a mono 22050 Hz (el AudioContext no existe en workers).
 * La spec avisa: transcripción APROXIMADA — mejor piano solo y limpio.
 */

export type TranscribeIn = { type: 'transcribe'; audio: Float32Array };
export type TranscribeOut =
  | { type: 'progress'; pct: number }
  | { type: 'done'; notes: RawNote[] }
  | { type: 'error'; message: string };

const post = (msg: TranscribeOut): void =>
  (self as unknown as { postMessage(m: TranscribeOut): void }).postMessage(msg);

async function loadModel(): Promise<tf.GraphModel> {
  const [modelJSON, weightData] = await Promise.all([
    fetch(modelJsonUrl).then((r) => r.json()),
    fetch(weightsUrl).then((r) => r.arrayBuffer()),
  ]);
  // IOHandler en memoria: evita que tfjs resuelva la ruta relativa de los
  // pesos (que el bundler renombra) desde el model.json.
  return tf.loadGraphModel({
    load: async () => ({
      modelTopology: modelJSON.modelTopology,
      format: modelJSON.format,
      generatedBy: modelJSON.generatedBy,
      convertedBy: modelJSON.convertedBy,
      weightSpecs: modelJSON.weightsManifest[0].weights,
      weightData,
    }),
  });
}

self.onmessage = async (event: MessageEvent<TranscribeIn>) => {
  if (event.data.type !== 'transcribe') return;
  try {
    await tf.ready();
    try {
      if (!(await tf.setBackend('webgl'))) await tf.setBackend('cpu');
    } catch {
      await tf.setBackend('cpu');
    }

    const basicPitch = new BasicPitch(loadModel());
    const frames: number[][] = [];
    const onsets: number[][] = [];
    await basicPitch.evaluateModel(
      event.data.audio,
      (f, o) => {
        frames.push(...f);
        onsets.push(...o);
      },
      (pct) => post({ type: 'progress', pct }),
    );

    const notes: RawNote[] = noteFramesToTime(
      outputToNotesPoly(frames, onsets, 0.5, 0.3, 5),
    ).map((n) => ({
      midi: n.pitchMidi,
      time: n.startTimeSeconds,
      duration: n.durationSeconds,
      velocity: Math.max(0.2, Math.min(1, n.amplitude)),
    }));
    post({ type: 'done', notes });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
