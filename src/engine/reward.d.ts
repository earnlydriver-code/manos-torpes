/** Tipos del código de referencia portado (reward.js). */
import type { Step, RewardWeights } from '../types/music';

/**
 * Recompensa total de una secuencia de 2-4 compases. Silencio total = -1;
 * entropía de tono < 1.2 bits devuelve un castigo suave (-0.5 + entropía·0.2).
 */
export function musicalReward(seq: Step[], w?: RewardWeights): number;
