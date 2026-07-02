import type { Finger, Genome, NoteEvent, Step } from '../types/music';
import { detectKeyRoot } from './chords';
import { STEPS_PER_BAR } from './constants';
import { varyGenome } from './genetic';
import { cloneGenome, repairGenome } from './genome';
import { musicalReward } from './reward';
import type { Rng } from './rng';
import { scaleInfo } from './reward-helpers';

/**
 * MODO CANCIÓN (mejora 5, queja del Usuario: "no son composiciones largas"):
 * el genético evoluciona FRASES (2-4 compases, donde converge bien) y esto
 * las convierte en una pieza larga con forma musical clásica A-A'-B-A''-coda.
 * Cada variación se elige entre varios candidatos por recompensa: la
 * estructura es determinista, el contenido compite.
 */

const CANDIDATES_PER_SECTION = 4;

type SectionSpec = { label: string; mutations: number };

const FORM: SectionSpec[] = [
  { label: 'A', mutations: 0 }, // el tema, tal cual salió del entrenamiento
  { label: "A'", mutations: 2 }, // variación ligera: reconocible
  { label: 'B', mutations: 6 }, // contraste: variación fuerte
  { label: "A''", mutations: 2 }, // regreso al tema, variado
];

function bestVariation(rng: Rng, base: Genome, mutations: number): Genome {
  if (mutations === 0) return cloneGenome(base);
  let best: Genome | null = null;
  let bestScore = -Infinity;
  for (let c = 0; c < CANDIDATES_PER_SECTION; c++) {
    const candidate = varyGenome(rng, base, mutations);
    const score = musicalReward(candidate.steps);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best ?? cloneGenome(base);
}

/** La octava del pitch class `pc` más cercana a `near`, dentro de [lo, hi]. */
function nearestOctave(pc: number, near: number, lo: number, hi: number): number {
  let best = lo + ((pc - lo) % 12 + 12) % 12;
  let bestDist = Infinity;
  for (let midi = best; midi <= hi; midi += 12) {
    const dist = Math.abs(midi - near);
    if (dist < bestDist) {
      bestDist = dist;
      best = midi;
    }
  }
  return best;
}

/** Última posición de una mano en la pieza (para no pedir viajes imposibles). */
function lastHandPosition(steps: Step[], hand: 'L' | 'R', fallback: number): number {
  for (let t = steps.length - 1; t >= 0; t--) {
    const handNotes = steps[t].notes.filter((n) => n.hand === hand);
    if (handNotes.length > 0) return Math.max(...handNotes.map((n) => n.midi));
  }
  return fallback;
}

/**
 * Compás final: la tónica sostenida en ambas manos — la pieza RESUELVE.
 * El acorde cae donde las manos ESTÁN (octava más cercana) y tras un respiro
 * de 2 steps: plantarlo en registros fijos hacía que la regla de viaje de
 * repairGenome lo borrara (las manos no llegaban a tiempo).
 */
function codaBar(base: Genome): Step[] {
  const midis = base.steps.flatMap((s) => s.notes.map((n) => n.midi));
  const { root, mode } = midis.length > 0 ? scaleInfo(midis) : { root: 0, mode: 'major' as const };
  const keyRoot = detectKeyRoot(base.steps);
  const tonic = ((((midis.length > 0 ? root : keyRoot) % 12) + 12) % 12);
  const thirdOffset = mode === 'minor' ? 3 : 4;

  const steps: Step[] = Array.from({ length: STEPS_PER_BAR }, (_, i) => ({ step: i, notes: [] }));
  const ONSET = 2; // un respiro antes del acorde final
  const DUR = STEPS_PER_BAR - ONSET;
  const note = (midi: number, hand: 'L' | 'R', finger: Finger): NoteEvent => ({
    midi,
    hand,
    finger,
    durSteps: DUR,
    vel: 0.65,
  });

  const lastL = lastHandPosition(base.steps, 'L', 48);
  const lastR = lastHandPosition(base.steps, 'R', 72);
  const lRoot = nearestOctave(tonic, lastL, 36, 55);
  steps[ONSET].notes.push(note(lRoot, 'L', 5), note(lRoot + 7, 'L', 1));
  const rRoot = nearestOctave(tonic, lastR, 57, 84);
  steps[ONSET].notes.push(
    note(rRoot, 'R', 1),
    note(rRoot + thirdOffset, 'R', 3),
    note(rRoot + 7, 'R', 5),
  );
  return steps;
}

/** Encadena secciones renumerando steps; repara el conjunto (viajes entre secciones). */
export function composeSong(rng: Rng, base: Genome): Genome {
  const sections: Step[][] = FORM.map((spec) => bestVariation(rng, base, spec.mutations).steps);
  sections.push(codaBar(base));

  const steps: Step[] = [];
  let offset = 0;
  for (const section of sections) {
    for (const s of section) {
      steps.push({ step: offset + s.step, notes: s.notes.map((n) => ({ ...n })) });
    }
    offset += section.length;
  }
  const song: Genome = { bars: offset / STEPS_PER_BAR, tempo: base.tempo, steps };
  // La reparación global cose las costuras: viajes imposibles entre secciones,
  // teclas re-pisadas en el corte, sostenidos que cruzan de sección.
  return repairGenome(song);
}
