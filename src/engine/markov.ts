import type { MarkovJson } from '../types/music';
import type { Step } from '../types/music';
import type { Rng } from './rng';

/**
 * Markov de orden alto sobre INTERVALOS de la voz superior (Etapa 2).
 * Intervalos ⇒ invariante a transposición: aprende el dibujo melódico, no las
 * notas absolutas. Backoff simple: al puntuar/muestrear se usa el contexto más
 * largo con datos; suavizado de Laplace solo al puntuar.
 */

export const INTERVAL_MAX = 24; // ±2 octavas; más allá se satura
const SYMBOLS = INTERVAL_MAX * 2 + 1; // 49

function clampInterval(iv: number): number {
  return Math.max(-INTERVAL_MAX, Math.min(INTERVAL_MAX, iv));
}

/**
 * Voz superior de una secuencia de steps → intervalos entre onsets
 * consecutivos (misma convención que melodicContour: nota más aguda por step
 * con notas). Es la representación que el modelo entrena y puntúa.
 */
export function melodyIntervals(seq: Step[]): number[] {
  const tops: number[] = [];
  for (const s of seq) {
    if (s.notes.length === 0) continue;
    tops.push(Math.max(...s.notes.map((n) => n.midi)));
  }
  const intervals: number[] = [];
  for (let i = 1; i < tops.length; i++) intervals.push(clampInterval(tops[i] - tops[i - 1]));
  return intervals;
}

type Table = Map<string, Map<number, number>>;

export class MarkovModel {
  readonly order: number;
  private tables: Table[]; // tables[k]: contextos de longitud k
  private totals: Map<string, number>[]; // suma de conteos por contexto
  refLogP = 0;
  readonly uniformLogP = -Math.log(SYMBOLS);

  constructor(order = 3) {
    this.order = order;
    this.tables = Array.from({ length: order + 1 }, () => new Map());
    this.totals = Array.from({ length: order + 1 }, () => new Map());
  }

  private bump(k: number, ctx: string, sym: number): void {
    let row = this.tables[k].get(ctx);
    if (!row) {
      row = new Map();
      this.tables[k].set(ctx, row);
    }
    row.set(sym, (row.get(sym) ?? 0) + 1);
    this.totals[k].set(ctx, (this.totals[k].get(ctx) ?? 0) + 1);
  }

  train(sequences: number[][]): void {
    for (const seq of sequences) {
      const s = seq.map(clampInterval);
      for (let i = 0; i < s.length; i++) {
        for (let k = 0; k <= this.order && k <= i; k++) {
          const ctx = s.slice(i - k, i).join(',');
          this.bump(k, ctx, s[i]);
        }
      }
    }
    // Techo de la similitud: cómo puntúa el modelo su propio corpus.
    const scores = sequences.filter((s) => s.length >= 2).map((s) => this.avgLogProb(s));
    this.refLogP =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : this.uniformLogP;
  }

  /** logP de un símbolo dado el contexto (backoff al contexto más largo con datos). */
  private logProb(context: number[], sym: number): number {
    for (let k = Math.min(this.order, context.length); k >= 0; k--) {
      const ctx = context.slice(context.length - k).join(',');
      const total = this.totals[k].get(ctx);
      if (total === undefined || total === 0) continue;
      const count = this.tables[k].get(ctx)?.get(sym) ?? 0;
      return Math.log((count + 0.5) / (total + 0.5 * SYMBOLS)); // Laplace suave
    }
    return this.uniformLogP;
  }

  /** logP promedio por símbolo de una secuencia de intervalos. */
  avgLogProb(sequence: number[]): number {
    const s = sequence.map(clampInterval);
    if (s.length === 0) return this.uniformLogP;
    let total = 0;
    for (let i = 0; i < s.length; i++) total += this.logProb(s.slice(0, i), s[i]);
    return total / s.length;
  }

  /** Muestrea el siguiente intervalo (sin suavizar: favorece patrones reales). */
  sample(rng: Rng, context: number[]): number {
    for (let k = Math.min(this.order, context.length); k >= 0; k--) {
      const ctx = context.slice(context.length - k).map(clampInterval).join(',');
      const row = this.tables[k].get(ctx);
      const total = this.totals[k].get(ctx);
      if (!row || !total) continue;
      // Orden numérico fijo: el orden de inserción del Map cambia al pasar por
      // JSON, y el muestreo debe ser idéntico antes y después de serializar.
      const entries = [...row.entries()].sort((a, b) => a[0] - b[0]);
      let r = rng() * total;
      for (const [sym, count] of entries) {
        r -= count;
        if (r <= 0) return sym;
      }
    }
    return Math.floor(rng() * SYMBOLS) - INTERVAL_MAX;
  }

  toJSON(): MarkovJson {
    return {
      order: this.order,
      refLogP: this.refLogP,
      uniformLogP: this.uniformLogP,
      tables: this.tables.map((table) => {
        const out: Record<string, Record<string, number>> = {};
        for (const [ctx, row] of table) {
          const r: Record<string, number> = {};
          for (const [sym, count] of row) r[String(sym)] = count;
          out[ctx] = r;
        }
        return out;
      }),
    };
  }

  static fromJSON(json: MarkovJson): MarkovModel {
    const model = new MarkovModel(json.order);
    model.refLogP = json.refLogP;
    json.tables.forEach((table, k) => {
      for (const [ctx, row] of Object.entries(table)) {
        for (const [sym, count] of Object.entries(row)) {
          const s = Number(sym);
          let mapRow = model.tables[k].get(ctx);
          if (!mapRow) {
            mapRow = new Map();
            model.tables[k].set(ctx, mapRow);
          }
          mapRow.set(s, count);
          model.totals[k].set(ctx, (model.totals[k].get(ctx) ?? 0) + count);
        }
      }
    });
    return model;
  }
}
