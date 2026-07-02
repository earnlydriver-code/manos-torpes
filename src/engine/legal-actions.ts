import type { Finger, Hand, NoteEvent } from '../types/music';
import { KBD_HI, KBD_LO } from './constants';
import { SPAN_MAX, travelCost } from './hand-physics';
import type { Rng } from './rng';
import { randInt, weightedPick } from './rng';
import { HAND_CROSS_TOLERANCE, validateStep } from './step-validator';

/**
 * Muestreo CONSTRUCTIVO de acciones legales: en vez de generar-y-descartar,
 * se construye dentro del espacio válido (anchor ± span, dedos en orden,
 * manos sin atravesarse) y validateHandShape/validateStep quedan como
 * cinturón y tirantes al final.
 */

export type HandState = {
  /**
   * Tecla del dedo guía de la spec §3 (pulgar en L, meñique en R): el tope
   * agudo del alcance. La mano llega hasta anchor - SPAN_MAX.
   */
  anchor: number;
  /** La mano está "en viaje" y no puede tocar antes de este step. */
  travelingUntilStep: number;
};

export type HandsState = { L: HandState; R: HandState };

/** Separación mínima entre anchors para que los alcances no se atraviesen. */
const MIN_ANCHOR_GAP = SPAN_MAX - HAND_CROSS_TOLERANCE + 6; // 15 st

export function initialHandsState(rng: Rng): HandsState {
  const left = randInt(rng, 50, 58); // alrededor de G3
  const right = randInt(rng, Math.max(left + MIN_ANCHOR_GAP, 74), 86); // alrededor de F5-A5
  return {
    L: { anchor: left, travelingUntilStep: 0 },
    R: { anchor: right, travelingUntilStep: 0 },
  };
}

/**
 * Mueve el anchor consultando travelCost ANTES (regla de oro de la spec — el
 * bug #2 es consultarlo después). Deja a la mano "en viaje" los pasos que cueste.
 */
export function moveAnchor(state: HandState, newAnchor: number, step: number): void {
  const cost = travelCost(state.anchor, newAnchor);
  state.anchor = newAnchor;
  if (cost > 0) state.travelingUntilStep = step + cost;
}

function clampAnchor(anchor: number): number {
  return Math.max(KBD_LO + SPAN_MAX, Math.min(KBD_HI, anchor));
}

/** Subconjunto creciente aleatorio de k dedos de 1..5 (asc para R, espejo desc para L). */
function sampleFingers(rng: Rng, count: number, side: Hand): Finger[] {
  const chosen = new Set<number>();
  while (chosen.size < count) chosen.add(randInt(rng, 1, 5));
  const ascending = [...chosen].sort((a, b) => a - b);
  return (side === 'R' ? ascending : ascending.reverse()) as Finger[];
}

const NOTE_COUNT_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.45],
  [1, 0.35],
  [2, 0.12],
  [3, 0.06],
  [4, 0.02],
];

const DUR_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [1, 0.4],
  [2, 0.35],
  [4, 0.2],
  [3, 0.05],
];

/**
 * Acción de UNA mano para un step. `otherHandNotes` son las notas ya generadas
 * de la otra mano en este step (para recortar el rango sin re-sortear a ciegas).
 */
export function sampleHandAction(
  rng: Rng,
  hands: HandsState,
  hand: Hand,
  step: number,
  totalSteps: number,
  otherHandNotes: NoteEvent[],
): NoteEvent[] {
  const state = hands[hand];
  if (step < state.travelingUntilStep) return []; // en viaje: la mano no toca

  // De vez en cuando, en frontera de beat, la mano se reubica (pagando viaje).
  if (step % 4 === 0 && rng() < 0.08) {
    const delta = (rng() < 0.5 ? -1 : 1) * randInt(rng, 3, 12);
    let proposed = clampAnchor(state.anchor + delta);
    if (hand === 'L') proposed = Math.min(proposed, hands.R.anchor - MIN_ANCHOR_GAP);
    else proposed = Math.max(proposed, hands.L.anchor + MIN_ANCHOR_GAP);
    proposed = clampAnchor(proposed);
    if (proposed !== state.anchor) {
      moveAnchor(state, proposed, step);
      if (step < state.travelingUntilStep) return []; // arrancó el viaje
    }
  }

  const count = weightedPick(rng, NOTE_COUNT_WEIGHTS);
  if (count === 0) return [];

  let lo = Math.max(KBD_LO, state.anchor - SPAN_MAX);
  let hi = Math.min(KBD_HI, state.anchor);
  // Recorte constructivo contra la otra mano (tolerancia de cruce de la spec).
  if (otherHandNotes.length > 0) {
    if (hand === 'R') {
      const maxLeft = Math.max(...otherHandNotes.map((n) => n.midi));
      lo = Math.max(lo, maxLeft - HAND_CROSS_TOLERANCE);
    } else {
      const minRight = Math.min(...otherHandNotes.map((n) => n.midi));
      hi = Math.min(hi, minRight + HAND_CROSS_TOLERANCE);
    }
  }
  if (hi < lo) return [];

  const keys = new Set<number>();
  const wanted = Math.min(count, hi - lo + 1);
  for (let tries = 0; keys.size < wanted && tries < 20; tries++) keys.add(randInt(rng, lo, hi));
  const sorted = [...keys].sort((a, b) => a - b);
  const fingers = sampleFingers(rng, sorted.length, hand);

  const notes: NoteEvent[] = sorted.map((midi, i) => ({
    midi,
    hand,
    finger: fingers[i],
    durSteps: Math.min(weightedPick(rng, DUR_WEIGHTS), Math.max(1, totalSteps - step)),
    vel: 0.4 + 0.6 * rng(),
  }));

  // Cinturón y tirantes: el validador portado es la fuente de verdad.
  const verdict = validateStep([...otherHandNotes, ...notes]);
  return verdict.legal ? notes : [];
}

/** Acción completa de un step: primero L, luego R recortando contra L. */
export function sampleStepNotes(
  rng: Rng,
  hands: HandsState,
  step: number,
  totalSteps: number,
): NoteEvent[] {
  const left = sampleHandAction(rng, hands, 'L', step, totalSteps, []);
  const right = sampleHandAction(rng, hands, 'R', step, totalSteps, left);
  return [...left, ...right];
}
