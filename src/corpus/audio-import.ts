import type { RawNote } from './midi-import';
import type { TranscribeIn, TranscribeOut } from '../workers/transcriber.worker';

/**
 * Camino MP3/WAV (experimental): decodificar en el hilo principal (el
 * AudioContext no existe en workers) y transcribir con Basic Pitch en el
 * worker. La spec lo deja claro: es APROXIMADO — el MIDI es el camino bueno.
 */

export const MAX_AUDIO_SECONDS = 240; // 4 min: en CPU la inferencia va a ~4x tiempo real

const BASIC_PITCH_SR = 22050;

export async function decodeAudioToMono22050(file: File): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: BASIC_PITCH_SR });
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration > MAX_AUDIO_SECONDS) {
      throw new Error(
        `El audio dura ${Math.round(decoded.duration)} s; el máximo es ${MAX_AUDIO_SECONDS} s (la transcripción en CPU es lenta).`,
      );
    }
    const mono = new Float32Array(decoded.length);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const data = decoded.getChannelData(ch);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
    }
    return mono;
  } finally {
    void ctx.close();
  }
}

/** Transcribe audio ya decodificado; el worker vive solo lo que dura el trabajo. */
export function transcribeAudio(
  audio: Float32Array,
  onProgress: (pct: number) => void,
): Promise<RawNote[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/transcriber.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<TranscribeOut>) => {
      const msg = event.data;
      if (msg.type === 'progress') onProgress(msg.pct);
      else if (msg.type === 'done') {
        worker.terminate();
        resolve(msg.notes);
      } else {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'el worker de transcripción falló'));
    };
    const message: TranscribeIn = { type: 'transcribe', audio };
    worker.postMessage(message, [audio.buffer]);
  });
}

/**
 * El audio no trae tempo: se estima probando cada BPM de 60 a 140 y quedándose
 * con el que deja los ataques más cerca de su rejilla de semicorcheas.
 */
export function estimateBpm(notes: RawNote[]): number {
  if (notes.length < 8) return 100;
  const onsets = [...new Set(notes.map((n) => Math.round(n.time * 1000) / 1000))].sort(
    (a, b) => a - b,
  );
  let bestBpm = 100;
  let bestErr = Infinity;
  for (let bpm = 60; bpm <= 140; bpm++) {
    const stepSec = 60 / bpm / 4;
    let err = 0;
    for (const t of onsets) {
      const pos = t / stepSec;
      err += Math.abs(pos - Math.round(pos));
    }
    err /= onsets.length;
    if (err < bestErr - 1e-6) {
      bestErr = err;
      bestBpm = bpm;
    }
  }
  return bestBpm;
}
