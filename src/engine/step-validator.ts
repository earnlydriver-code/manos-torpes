import type { NoteEvent } from '../types/music';
import { validateHandShape } from './hand-physics';

/**
 * Reglas físicas ENTRE manos (spec §3, reglas 1 y 4). validateHandShape (portado)
 * valida una mano aislada; esto valida el step completo.
 */

export const MAX_TOTAL_NOTES = 10; // regla 1: máximo 10 notas simultáneas
export const HAND_CROSS_TOLERANCE = 3; // regla 4: tolerancia de cruce de 3 semitonos

export type StepValidation = { legal: boolean; reason?: string };

export function validateStep(notes: NoteEvent[]): StepValidation {
  if (notes.length > MAX_TOTAL_NOTES) return { legal: false, reason: 'more_than_10_notes' };

  for (const hand of ['L', 'R'] as const) {
    const handNotes = notes.filter((n) => n.hand === hand);
    if (handNotes.length === 0) continue;
    // "Un dedo, una tecla" también implica una tecla por mano una sola vez.
    if (new Set(handNotes.map((n) => n.midi)).size !== handNotes.length)
      return { legal: false, reason: 'key_reused' };
    const sorted = [...handNotes].sort((a, b) => a.midi - b.midi);
    const result = validateHandShape(
      sorted.map((n) => n.midi),
      sorted.map((n) => n.finger),
      hand,
    );
    if (!result.legal) return { legal: false, reason: result.reason };
  }

  const left = notes.filter((n) => n.hand === 'L');
  const right = notes.filter((n) => n.hand === 'R');
  if (left.length > 0 && right.length > 0) {
    const maxLeft = Math.max(...left.map((n) => n.midi));
    const minRight = Math.min(...right.map((n) => n.midi));
    if (maxLeft > minRight + HAND_CROSS_TOLERANCE)
      return { legal: false, reason: 'hands_crossed' };
  }

  return { legal: true };
}
