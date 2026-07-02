import type { Genome, NoteEvent, TrainConfig } from '../types/music';
import { STEPS_PER_BAR } from './constants';
import { travelCost } from './hand-physics';
import { initialHandsState, sampleStepNotes } from './legal-actions';
import type { Rng } from './rng';
import { validateStep } from './step-validator';

/** Genoma aleatorio físicamente legal por construcción. */
export function randomGenome(rng: Rng, cfg: Pick<TrainConfig, 'bars' | 'tempo'>): Genome {
  const totalSteps = cfg.bars * STEPS_PER_BAR;
  const hands = initialHandsState(rng);
  const steps = Array.from({ length: totalSteps }, (_, t) => ({
    step: t,
    notes: sampleStepNotes(rng, hands, t, totalSteps),
  }));
  return { bars: cfg.bars, tempo: cfg.tempo, steps };
}

export function cloneGenome(g: Genome): Genome {
  return {
    bars: g.bars,
    tempo: g.tempo,
    steps: g.steps.map((s) => ({ step: s.step, notes: s.notes.map((n) => ({ ...n })) })),
  };
}

/**
 * Reparación mínima tras crossover/mutación (la spec prefiere reparar a
 * descartar: descartar castiga al crossover y frena la convergencia):
 *  1. Steps ilegales pierden su nota de menor vel hasta ser legales.
 *  2. La regla de viaje se re-impone: si una mano no tuvo tiempo de llegar
 *     (travelCost > pasos transcurridos desde su última posición), ese step
 *     pierde las notas de esa mano — nada de teletransportes.
 */
export function repairGenome(g: Genome): Genome {
  const lastSeen: Record<'L' | 'R', { step: number; pos: number } | null> = { L: null, R: null };

  for (const s of g.steps) {
    // 1. Legalidad del step (forma de mano, cruce de manos, ≤10 notas).
    let verdict = validateStep(s.notes);
    while (!verdict.legal && s.notes.length > 0) {
      let worst = 0;
      for (let i = 1; i < s.notes.length; i++) if (s.notes[i].vel < s.notes[worst].vel) worst = i;
      s.notes.splice(worst, 1);
      verdict = validateStep(s.notes);
    }

    // 2. Regla de viaje por mano.
    for (const hand of ['L', 'R'] as const) {
      const handNotes = s.notes.filter((n) => n.hand === hand);
      if (handNotes.length === 0) continue;
      const pos = Math.max(...handNotes.map((n) => n.midi));
      const last = lastSeen[hand];
      if (last !== null) {
        const gap = s.step - last.step;
        if (travelCost(last.pos, pos) > gap) {
          s.notes = s.notes.filter((n) => n.hand !== hand);
          continue;
        }
      }
      lastSeen[hand] = { step: s.step, pos };
    }
  }
  return g;
}

/** Todas las notas del genoma con su índice de step (útil para mutaciones). */
export function allNotes(g: Genome): Array<{ stepIndex: number; note: NoteEvent }> {
  const out: Array<{ stepIndex: number; note: NoteEvent }> = [];
  for (let t = 0; t < g.steps.length; t++)
    for (const note of g.steps[t].notes) out.push({ stepIndex: t, note });
  return out;
}
