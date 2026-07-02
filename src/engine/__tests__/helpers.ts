import type { Finger, Hand, NoteEvent, Step } from '../../types/music';

/** Constructor breve de notas para tests. */
export function note(midi: number, hand: Hand, finger: Finger, durSteps = 1, vel = 0.8): NoteEvent {
  return { midi, hand, finger, durSteps, vel };
}

/** Secuencia de `length` steps vacíos, lista para poblar. */
export function emptySeq(length: number): Step[] {
  return Array.from({ length }, (_, i) => ({ step: i, notes: [] as NoteEvent[] }));
}
