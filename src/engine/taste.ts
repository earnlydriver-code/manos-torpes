import type { RewardWeights } from '../types/music';
import { DEFAULT_WEIGHTS } from './constants';
import type { RewardComponents } from './reward-breakdown';

/**
 * Etapa 3 «Tu alumno» (spec §5): el feedback humano ajusta los PESOS de la
 * recompensa — nunca la heurística interna. RLHF casero tipo bandit con
 * actualización exponencial (Hedge): lo que destacaba en algo que te gustó
 * gana peso; lo que destacaba en algo que no, lo pierde.
 */

export type Rating = 1 | -1; // 👍 / 👎

export type Taste = { weights: RewardWeights; ratings: number };

const ETA = 0.25; // tamaño del paso por calificación
const MIN_W = 0.03; // ningún componente muere: las defensas siguen vivas
const MAX_W = 0.45; // ninguno domina: el gusto matiza, no reescribe

export const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS) as Array<keyof RewardWeights>;

export function defaultTaste(): Taste {
  return { weights: { ...DEFAULT_WEIGHTS }, ratings: 0 };
}

function normalize(w: RewardWeights): RewardWeights {
  const out = { ...w };
  // Clamp y renormalizado a suma 1 (dos pasadas bastan con estos márgenes).
  for (let pass = 0; pass < 2; pass++) {
    let sum = 0;
    for (const k of WEIGHT_KEYS) sum += out[k];
    for (const k of WEIGHT_KEYS) {
      out[k] = Math.max(MIN_W, Math.min(MAX_W, out[k] / sum));
    }
  }
  let sum = 0;
  for (const k of WEIGHT_KEYS) sum += out[k];
  for (const k of WEIGHT_KEYS) out[k] = out[k] / sum;
  return out;
}

/**
 * Una calificación sobre lo que ESTABA SONANDO. `components` son las
 * puntuaciones crudas de ese genoma (rewardBreakdown): el update premia o
 * castiga cada componente según cuánto destacaba sobre la media.
 */
export function updateWeights(
  weights: RewardWeights,
  components: RewardComponents,
  rating: Rating,
): RewardWeights {
  const values = WEIGHT_KEYS.map((k) => components[k]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const next = { ...weights };
  for (const k of WEIGHT_KEYS) {
    const advantage = components[k] - mean;
    next[k] = weights[k] * Math.exp(ETA * rating * advantage);
  }
  return normalize(next);
}
