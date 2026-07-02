import * as Tone from 'tone';
import type { Genome, Hand } from '../types/music';
import { midiToNote } from './piano';

/**
 * Reproductor de genomas: convierte un Genome en un Tone.Part sincronizado al
 * Transport, y notifica cada step a la UI (via Draw, alineado al audio) para
 * iluminar el teclado. Solo hilo principal — el worker jamás toca esto.
 */

export type StepHighlight = { midi: number; hand: Hand; finger: number; vel: number };
export type StepCallback = (stepIndex: number | null, highlights: StepHighlight[]) => void;

let part: Tone.Part<{ time: number; stepIndex: number }> | null = null;
let currentOnStep: StepCallback | null = null;
let activeSampler: Tone.Sampler | null = null;

export function isPlaying(): boolean {
  return part !== null;
}

export function stopPlayback(): void {
  if (part) {
    part.stop();
    part.dispose();
    part = null;
  }
  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();
  // Los releases de triggerAttackRelease están programados en tiempo absoluto
  // del AudioContext, no en el Transport: sin esto, las notas sostenidas siguen
  // sonando segundos después de Detener (hallazgo de la revisión adversarial).
  activeSampler?.releaseAll();
  activeSampler = null;
  currentOnStep?.(null, []);
  currentOnStep = null;
}

export function playGenome(
  genome: Genome,
  sampler: Tone.Sampler,
  onStep: StepCallback,
  loop = true,
): void {
  stopPlayback();
  currentOnStep = onStep;
  activeSampler = sampler;
  const stepSeconds = 60 / genome.tempo / 4; // semicorchea
  const totalSeconds = genome.steps.length * stepSeconds;

  const events = genome.steps.map((s) => ({ time: s.step * stepSeconds, stepIndex: s.step }));
  part = new Tone.Part((time, event) => {
    const step = genome.steps[event.stepIndex];
    for (const n of step.notes) {
      sampler.triggerAttackRelease(
        midiToNote(n.midi),
        Math.max(1, n.durSteps) * stepSeconds,
        time,
        n.vel,
      );
    }
    Tone.getDraw().schedule(() => {
      currentOnStep?.(
        event.stepIndex,
        step.notes.map((n) => ({ midi: n.midi, hand: n.hand, finger: n.finger, vel: n.vel })),
      );
    }, time);
  }, events);
  part.loop = loop;
  part.loopStart = 0;
  part.loopEnd = totalSeconds;
  part.start(0);
  Tone.getTransport().start();
}
