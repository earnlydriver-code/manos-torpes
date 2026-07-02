import type { RewardWeights, Step } from '../types/music';
import type { ChordModel } from './chords';
import { harmonicSimilarity } from './chords';
import { DEFAULT_WEIGHTS } from './constants';
import { MarkovModel, melodyIntervals } from './markov';
import { musicalReward } from './reward';

/**
 * Etapa 2 «Estudiante» (spec §5): la recompensa heurística de la Etapa 1 se
 * MEZCLA con la similitud estadística al corpus — no se sustituye. El reward.js
 * portado queda intacto; la mezcla vive aquí, fuera de él.
 */

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Entropía (bits) de la distribución de una lista de intervalos. */
function intervalEntropy(intervals: number[]): number {
  const counts = new Map<number, number>();
  for (const iv of intervals) counts.set(iv, (counts.get(iv) ?? 0) + 1);
  let h = 0;
  for (const count of counts.values()) {
    const p = count / intervals.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Similitud ∈ [0,1] de la melodía a lo aprendido del corpus: logP promedio de
 * sus intervalos bajo el modelo, normalizado entre "elegir al azar" (0) y
 * "sonar como el corpus" (1) — y ESCALADO por diversidad melódica.
 *
 * El factor de diversidad es la defensa anti-exploit descubierta en las
 * pruebas del Usuario: un bucle de 2 intervalos puede ser MÁS "probable" que
 * el corpus entero (similitud 1.0 sonando horrible). Se exige una variedad de
 * intervalos comparable a la de la música real.
 */
export function corpusSimilarity(seq: Step[], model: MarkovModel): number {
  const intervals = melodyIntervals(seq);
  if (intervals.length < 4) return 0; // sin material melódico no hay parecido
  const span = model.refLogP - model.uniformLogP;
  if (span <= 1e-9) return 0; // modelo degenerado (corpus vacío o uniforme)
  const likelihood = clamp01((model.avgLogProb(intervals) - model.uniformLogP) / span);
  const refEntropy = model.refEntropy;
  const diversity = refEntropy > 1e-9 ? clamp01(intervalEntropy(intervals) / refEntropy) : 1;
  return likelihood * diversity;
}

/**
 * Recompensa mezclada. Las defensas anti-trampa del reward portado (silencio
 * = -1, entropía < 1.2) devuelven ≤ -0.26 y se respetan TAL CUAL: mezclarlas
 * con la similitud diluiría el castigo y reabriría los exploits.
 *
 * Con modelo de acordes, el parecido al corpus tiene dos oídos: la MELODÍA
 * (cómo se mueve la voz de la derecha) y la ARMONÍA (qué acordes se suceden).
 */
export function blendedReward(
  seq: Step[],
  model: MarkovModel,
  alpha: number,
  w: RewardWeights = DEFAULT_WEIGHTS,
  chords?: ChordModel | null,
): number {
  const base = musicalReward(seq, w);
  if (base <= -0.2) return base;
  const melodic = corpusSimilarity(seq, model);
  const similarity = chords ? 0.55 * melodic + 0.45 * harmonicSimilarity(seq, chords) : melodic;
  return (1 - alpha) * base + alpha * similarity;
}
