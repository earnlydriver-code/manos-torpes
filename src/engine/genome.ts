import type { Genome, Hand, NoteEvent, TrainConfig } from '../types/music';
import { STEPS_PER_BAR } from './constants';
import { SPAN_MAX, travelCost, validateHandShape } from './hand-physics';
import { initialHandsState, sampleStepNotes } from './legal-actions';
import type { Rng } from './rng';
import { validateStep } from './step-validator';

/** Genoma aleatorio físicamente legal por construcción (y pasado por repair, ver abajo). */
export function randomGenome(rng: Rng, cfg: Pick<TrainConfig, 'bars' | 'tempo'>): Genome {
  const totalSteps = cfg.bars * STEPS_PER_BAR;
  const hands = initialHandsState(rng);
  const steps = Array.from({ length: totalSteps }, (_, t) => ({
    step: t,
    notes: sampleStepNotes(rng, hands, t, totalSteps),
  }));
  // El sampler no mira las notas SOSTENIDAS de steps anteriores: repair
  // garantiza el invariante completo también para los genomas frescos.
  return repairGenome({ bars: cfg.bars, tempo: cfg.tempo, steps });
}

export function cloneGenome(g: Genome): Genome {
  return {
    bars: g.bars,
    tempo: g.tempo,
    steps: g.steps.map((s) => ({ step: s.step, notes: s.notes.map((n) => ({ ...n })) })),
  };
}

type HeldNote = { note: NoteEvent; onsetStep: number };

/** ¿La forma combinada (sostenidas + onsets nuevos) es una mano legal? */
function combinedShapeLegal(heldNotes: NoteEvent[], newNotes: NoteEvent[], hand: Hand): boolean {
  for (const h of heldNotes) {
    if (newNotes.some((n) => n.finger === h.finger || n.midi === h.midi)) return false;
  }
  const all = [...heldNotes, ...newNotes].sort((a, b) => a.midi - b.midi);
  if (all.length > 5) return false;
  return validateHandShape(
    all.map((n) => n.midi),
    all.map((n) => n.finger),
    hand,
  ).legal;
}

/**
 * Reparación mínima tras crossover/mutación (la spec prefiere reparar a
 * descartar: descartar castiga al crossover y frena la convergencia).
 *
 *  1. Steps con onsets ilegales pierden su nota de menor vel hasta ser legales.
 *  2. Física de SOSTENIDOS: una mano que sigue apretando teclas de un onset
 *     anterior debe poder abarcar también las nuevas (mismo dedo/tecla libres,
 *     span combinado, orden de dedos). Si no puede, suelta antes las sostenidas
 *     (se truncan sus durSteps: la mano se replanta — menos destructivo que
 *     borrar notas).
 *  3. Regla de viaje con semántica de ANCHOR-VENTANA: el anchor es el tope
 *     agudo del alcance; tocar dentro de la ventana [anchor-12, anchor] NO es
 *     viajar (mover un dedo dentro del span no mueve la mano — hallazgo de la
 *     revisión). Solo cuando el onset cae fuera se mueve el anchor lo mínimo,
 *     pagando travelCost; si no dio tiempo (o había sostenidas que lo impiden),
 *     ese onset se elimina — nada de teletransportes.
 */
export function repairGenome(g: Genome): Genome {
  // Paso A: legalidad de cada step aislado (forma de manos, cruce, ≤10 notas).
  for (const s of g.steps) {
    let verdict = validateStep(s.notes);
    while (!verdict.legal && s.notes.length > 0) {
      let worst = 0;
      for (let i = 1; i < s.notes.length; i++) if (s.notes[i].vel < s.notes[worst].vel) worst = i;
      s.notes.splice(worst, 1);
      verdict = validateStep(s.notes);
    }
  }

  // Paso B: sostenidos + viaje, por mano. El anchor de una mano no queda
  // determinado por una sola nota (la nota puede caer bajo cualquier dedo),
  // así que se propaga el INTERVALO factible de anchors [fLo, fHi] y solo se
  // declara viaje cuando el onset nuevo queda fuera de todo el intervalo.
  for (const hand of ['L', 'R'] as const) {
    let feasible: [number, number] | null = null;
    let lastOnsetStep = -Infinity;
    let held: HeldNote[] = [];

    for (const s of g.steps) {
      const t = s.step;
      held = held.filter((h) => h.onsetStep + h.note.durSteps > t);
      const handNotes = s.notes.filter((n) => n.hand === hand);
      if (handNotes.length === 0) continue;

      const mn = Math.min(...handNotes.map((n) => n.midi));
      const mx = Math.max(...handNotes.map((n) => n.midi));
      // Anchors (tope agudo del alcance) que llegan a este onset: [mx, mn+12].
      const lo = mx;
      const hi = mn + SPAN_MAX;

      if (feasible === null) {
        feasible = [lo, hi];
      } else if (feasible[0] <= hi && lo <= feasible[1]) {
        // Alcanzable sin mover la mano: el intervalo solo se estrecha.
        feasible = [Math.max(feasible[0], lo), Math.min(feasible[1], hi)];
      } else {
        // Viaje mínimo: distancia entre el intervalo factible y la ventana nueva.
        const dist = lo > feasible[1] ? lo - feasible[1] : feasible[0] - hi;
        const cost = travelCost(0, dist);
        const freeFrom = t - cost; // la mano debía estar libre desde aquí
        const travelPossible =
          freeFrom >= lastOnsetStep + 1 && held.every((h) => h.onsetStep + 1 <= freeFrom);
        if (!travelPossible) {
          s.notes = s.notes.filter((n) => n.hand !== hand); // teletransporte: fuera
          continue;
        }
        // Soltar lo sostenido antes de viajar (truncar al inicio del viaje).
        for (const h of held) {
          h.note.durSteps = Math.min(h.note.durSteps, Math.max(1, freeFrom - h.onsetStep));
        }
        held = [];
        feasible = [lo, hi];
      }

      // Conflicto físico con lo aún sostenido ⇒ la mano se replanta (truncar).
      if (held.length > 0 && !combinedShapeLegal(held.map((h) => h.note), handNotes, hand)) {
        for (const h of held) {
          h.note.durSteps = Math.min(h.note.durSteps, Math.max(1, t - h.onsetStep));
        }
        held = [];
      }

      lastOnsetStep = t;
      for (const n of handNotes) {
        if (t + n.durSteps > g.steps.length) n.durSteps = g.steps.length - t;
        if (n.durSteps > 1) held.push({ note: n, onsetStep: t });
      }
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
