import type { Step } from '../types/music';
import { scaleInfo } from './reward-helpers';
import type { Rng } from './rng';

/**
 * ARMONÍA HORIZONTAL (mejora 1/4, decidida con el Usuario): detectar los
 * acordes del corpus y aprender qué acorde sigue a cuál. El oído vertical
 * evita lo feo; esto construye lo bello — la música gana dirección
 * (tensión → resolución) y la mano izquierda gana un trabajo: acompañar.
 *
 * Todo es RELATIVO a la tonalidad detectada (grados, no notas absolutas):
 * una progresión aprendida en La menor sirve en Do mayor.
 */

export type ChordQuality = 'M' | 'm';
/** "0M" = tónica mayor, "9m" = sexto grado menor, 'N' = sin acorde claro. */
export type ChordSymbol = string;

export const SEGMENT_STEPS = 8; // medio compás: el pulso armónico típico
const CHORDNESS_MIN = 0.6; // cobertura mínima para declarar un acorde
const VOCAB = 25; // 12 raíces × 2 calidades + 'N'

export type { ChordModelJson } from '../types/music';
import type { ChordModelJson } from '../types/music';

type SegmentInfo = { symbol: ChordSymbol; chordness: number };

/** Peso de cada clase de tono en un tramo (duración × velocidad). */
function pitchClassWeights(steps: Step[], from: number, to: number): number[] {
  const weights = new Array<number>(12).fill(0);
  for (const s of steps) {
    if (s.step < from || s.step >= to) continue;
    for (const n of s.notes) weights[n.midi % 12] += Math.max(1, n.durSteps) * n.vel;
  }
  return weights;
}

/** Mejor tríada (mayor/menor sobre 12 raíces) para un vector de pesos. */
function bestTriad(weights: number[]): { root: number; quality: ChordQuality; coverage: number } {
  const total = weights.reduce((a, b) => a + b, 0);
  let best = { root: 0, quality: 'M' as ChordQuality, coverage: 0 };
  if (total <= 0) return best;
  for (let root = 0; root < 12; root++) {
    for (const quality of ['M', 'm'] as const) {
      const third = (root + (quality === 'M' ? 4 : 3)) % 12;
      const fifth = (root + 7) % 12;
      // La raíz pesa más: distingue Do mayor de La menor con las mismas notas.
      const coverage = (weights[root] * 1.25 + weights[third] + weights[fifth]) / (total * 1.25);
      if (coverage > best.coverage) best = { root, quality, coverage };
    }
  }
  return best;
}

/** Tonalidad del pasaje (raíz 0-11) — la referencia para los grados. */
export function detectKeyRoot(steps: Step[]): number {
  const midis = steps.flatMap((s) => s.notes.map((n) => n.midi));
  if (midis.length === 0) return 0;
  return scaleInfo(midis).root;
}

/** Acordes por medio compás, como símbolos relativos a la tonalidad. */
export function detectChordSegments(steps: Step[], keyRoot: number): SegmentInfo[] {
  const total = steps.length;
  const out: SegmentInfo[] = [];
  for (let from = 0; from + SEGMENT_STEPS <= total; from += SEGMENT_STEPS) {
    const weights = pitchClassWeights(steps, from, from + SEGMENT_STEPS);
    const { root, quality, coverage } = bestTriad(weights);
    if (coverage >= CHORDNESS_MIN) {
      out.push({ symbol: `${(root - keyRoot + 12) % 12}${quality}`, chordness: coverage });
    } else {
      out.push({ symbol: 'N', chordness: coverage });
    }
  }
  return out;
}

export class ChordModel {
  private transitions = new Map<string, Map<string, number>>();
  private totals = new Map<string, number>();
  refLogP = 0;
  readonly uniformLogP = -Math.log(VOCAB);

  train(sequences: ChordSymbol[][]): void {
    for (const seq of sequences) {
      for (let i = 1; i < seq.length; i++) {
        const from = seq[i - 1];
        let row = this.transitions.get(from);
        if (!row) {
          row = new Map();
          this.transitions.set(from, row);
        }
        row.set(seq[i], (row.get(seq[i]) ?? 0) + 1);
        this.totals.set(from, (this.totals.get(from) ?? 0) + 1);
      }
    }
    const scores = sequences.filter((s) => s.length >= 2).map((s) => this.avgLogProb(s));
    this.refLogP =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : this.uniformLogP;
  }

  private logProb(from: ChordSymbol, to: ChordSymbol): number {
    const row = this.transitions.get(from);
    const total = this.totals.get(from);
    if (!row || !total) return this.uniformLogP;
    return Math.log(((row.get(to) ?? 0) + 0.5) / (total + 0.5 * VOCAB));
  }

  avgLogProb(seq: ChordSymbol[]): number {
    if (seq.length < 2) return this.uniformLogP;
    let sum = 0;
    for (let i = 1; i < seq.length; i++) sum += this.logProb(seq[i - 1], seq[i]);
    return sum / (seq.length - 1);
  }

  /** Muestrea el acorde siguiente (orden numérico fijo: sobrevive al JSON). */
  sample(rng: Rng, from: ChordSymbol): ChordSymbol {
    const row = this.transitions.get(from);
    const total = this.totals.get(from);
    if (!row || !total) return '0M';
    const entries = [...row.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    let r = rng() * total;
    for (const [sym, count] of entries) {
      r -= count;
      if (r <= 0) return sym;
    }
    return entries[entries.length - 1][0];
  }

  toJSON(): ChordModelJson {
    const transitions: Record<string, Record<string, number>> = {};
    for (const [from, row] of this.transitions) {
      transitions[from] = {};
      for (const [to, count] of row) transitions[from][to] = count;
    }
    return { refLogP: this.refLogP, transitions };
  }

  static fromJSON(json: ChordModelJson): ChordModel {
    const model = new ChordModel();
    model.refLogP = json.refLogP;
    for (const [from, row] of Object.entries(json.transitions)) {
      const map = new Map<string, number>();
      let total = 0;
      for (const [to, count] of Object.entries(row)) {
        map.set(to, count);
        total += count;
      }
      model.transitions.set(from, map);
      model.totals.set(from, total);
    }
    return model;
  }
}

/** Secuencia de acordes de una pieza (para entrenar el modelo). */
export function chordSequence(steps: Step[]): ChordSymbol[] {
  return detectChordSegments(steps, detectKeyRoot(steps)).map((s) => s.symbol);
}

/**
 * Similitud armónica ∈ [0,1]: ¿los acordes del genoma existen (chordness) y
 * se suceden como en el corpus (progresiones aprendidas)?
 */
export function harmonicSimilarity(steps: Step[], model: ChordModel): number {
  const keyRoot = detectKeyRoot(steps);
  const segments = detectChordSegments(steps, keyRoot);
  if (segments.length < 2) return 0;
  const chordness =
    segments.reduce((a, s) => a + s.chordness, 0) / segments.length / CHORDNESS_MIN;
  const span = model.refLogP - model.uniformLogP;
  if (span <= 1e-9) return 0;
  const like = (model.avgLogProb(segments.map((s) => s.symbol)) - model.uniformLogP) / span;
  return Math.max(0, Math.min(1, like)) * Math.max(0, Math.min(1, chordness));
}
