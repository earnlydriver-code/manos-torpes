import type { RewardWeights, Step } from '../types/music';
import { DEFAULT_WEIGHTS } from './constants';
import { MarkovModel, melodyIntervals } from './markov';
import { musicalReward } from './reward';

/**
 * Etapa 2 «Estudiante» (spec §5): la recompensa heurística de la Etapa 1 se
 * MEZCLA con la similitud estadística al corpus — no se sustituye. El reward.js
 * portado queda intacto; la mezcla vive aquí, fuera de él.
 */

/**
 * Similitud ∈ [0,1] de la melodía a lo aprendido del corpus: logP promedio de
 * sus intervalos bajo el modelo, normalizado entre "elegir al azar" (0) y
 * "sonar como el corpus" (1).
 */
export function corpusSimilarity(seq: Step[], model: MarkovModel): number {
  const intervals = melodyIntervals(seq);
  if (intervals.length < 4) return 0; // sin material melódico no hay parecido
  const span = model.refLogP - model.uniformLogP;
  if (span <= 1e-9) return 0; // modelo degenerado (corpus vacío o uniforme)
  const score = (model.avgLogProb(intervals) - model.uniformLogP) / span;
  return Math.max(0, Math.min(1, score));
}

/**
 * Recompensa mezclada. Las defensas anti-trampa del reward portado (silencio
 * = -1, entropía < 1.2) devuelven ≤ -0.26 y se respetan TAL CUAL: mezclarlas
 * con la similitud diluiría el castigo y reabriría los exploits.
 */
export function blendedReward(
  seq: Step[],
  model: MarkovModel,
  alpha: number,
  w: RewardWeights = DEFAULT_WEIGHTS,
): number {
  const base = musicalReward(seq, w);
  if (base <= -0.2) return base;
  return (1 - alpha) * base + alpha * corpusSimilarity(seq, model);
}
