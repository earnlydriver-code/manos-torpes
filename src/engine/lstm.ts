import type { LstmJson } from '../types/music';
import { INTERVAL_MAX } from './markov';
import type { Rng } from './rng';

/**
 * Forward de la LSTM en JS puro (mejora 3/4). El entrenamiento vive en
 * corpus/lstm-train.ts (TF.js, hilo principal, una vez por corpus); esto es
 * la INFERENCIA: corre en el worker sin TF.js, determinista y testeable.
 * Replica exactamente tf.layers.lstm con activation=tanh y
 * recurrentActivation=sigmoid (puertas en orden i, f, g, o).
 *
 * Papel en el sistema: COMPOSITORA. Genera frases con memoria de 16
 * intervalos (vs 3-5 del Markov) que el mutador de licks inyecta. No puntúa
 * genomas: un forward por evaluación × 192k evaluaciones rompería el
 * criterio de <2 min de la spec. El crítico rápido sigue siendo el Markov.
 */

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export class LstmModel {
  readonly contextLen = 16;
  private readonly json: LstmJson;
  /**
   * Temperatura de MUESTREO (no afecta a avgLogProb). Las LSTM con corpus
   * pequeño colapsan en su modo — repiten el motivo más probable en bucle,
   * justo la queja del Usuario. T>1 reparte probabilidad y devuelve variedad.
   */
  private readonly temperature: number;
  private h: Float64Array;
  private c: Float64Array;
  private z: Float64Array;

  constructor(json: LstmJson, temperature = 1) {
    this.json = json;
    this.temperature = temperature;
    this.h = new Float64Array(json.hidden);
    this.c = new Float64Array(json.hidden);
    this.z = new Float64Array(4 * json.hidden);
  }

  get refLogP(): number {
    return this.json.refLogP;
  }
  get uniformLogP(): number {
    return this.json.uniformLogP;
  }
  get refEntropy(): number {
    return this.json.refEntropy;
  }

  private reset(): void {
    this.h.fill(0);
    this.c.fill(0);
  }

  private symbolOf(interval: number): number {
    const clamped = Math.max(-INTERVAL_MAX, Math.min(INTERVAL_MAX, interval));
    return clamped + INTERVAL_MAX;
  }

  /** Avanza un paso con el símbolo dado; deja h/c actualizados. */
  private step(symbol: number): void {
    const { embedDim, hidden, emb, kernel, recurrent, bias } = this.json;
    const z = this.z;
    for (let j = 0; j < 4 * hidden; j++) z[j] = bias[j];
    const x = emb[symbol];
    for (let e = 0; e < embedDim; e++) {
      const xe = x[e];
      if (xe === 0) continue;
      const row = kernel[e];
      for (let j = 0; j < 4 * hidden; j++) z[j] += xe * row[j];
    }
    for (let u = 0; u < hidden; u++) {
      const hu = this.h[u];
      if (hu === 0) continue;
      const row = recurrent[u];
      for (let j = 0; j < 4 * hidden; j++) z[j] += hu * row[j];
    }
    for (let u = 0; u < hidden; u++) {
      const i = sigmoid(z[u]);
      const f = sigmoid(z[hidden + u]);
      const g = Math.tanh(z[2 * hidden + u]);
      const o = sigmoid(z[3 * hidden + u]);
      const cNew = f * this.c[u] + i * g;
      this.c[u] = cNew;
      this.h[u] = o * Math.tanh(cNew);
    }
  }

  /** log-probabilidades del siguiente símbolo dado el estado actual. */
  private logits(): number[] {
    const { hidden, vocab, outW, outB } = this.json;
    const out = outB.slice();
    for (let u = 0; u < hidden; u++) {
      const hu = this.h[u];
      if (hu === 0) continue;
      const row = outW[u];
      for (let v = 0; v < vocab; v++) out[v] += hu * row[v];
    }
    let max = -Infinity;
    for (const v of out) if (v > max) max = v;
    let sum = 0;
    for (let v = 0; v < out.length; v++) sum += Math.exp(out[v] - max);
    const logZ = max + Math.log(sum);
    return out.map((v) => v - logZ);
  }

  /** Distribución softmax del siguiente símbolo (para muestrear y testear). */
  probs(context: number[], temperature = 1): number[] {
    this.reset();
    for (const iv of context.slice(-2 * this.contextLen)) this.step(this.symbolOf(iv));
    const logits = this.logits();
    if (temperature === 1) return logits.map(Math.exp);
    const scaled = logits.map((l) => l / temperature);
    const max = Math.max(...scaled);
    const exps = scaled.map((l) => Math.exp(l - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
  }

  /** logP promedio por transición de una secuencia de intervalos. */
  avgLogProb(sequence: number[]): number {
    if (sequence.length < 2) return this.json.uniformLogP;
    this.reset();
    this.step(this.symbolOf(sequence[0]));
    let total = 0;
    for (let i = 1; i < sequence.length; i++) {
      total += this.logits()[this.symbolOf(sequence[i])];
      this.step(this.symbolOf(sequence[i]));
    }
    return total / (sequence.length - 1);
  }

  /** Muestrea el siguiente intervalo dado el contexto (determinista con rng). */
  sample(rng: Rng, context: number[]): number {
    const probs = this.probs(context, this.temperature);
    let r = rng();
    for (let v = 0; v < probs.length; v++) {
      r -= probs[v];
      if (r <= 0) return v - INTERVAL_MAX;
    }
    return probs.length - 1 - INTERVAL_MAX;
  }

  toJSON(): LstmJson {
    return this.json;
  }

  static fromJSON(json: LstmJson, temperature = 1): LstmModel {
    return new LstmModel(json, temperature);
  }
}
