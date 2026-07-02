import type { RewardWeights } from '../types/music';

export const KBD_LO = 36; // C2
export const KBD_HI = 96; // C7
export const STEPS_PER_BAR = 16; // semicorcheas por compás de 4/4
export const STEPS_PER_BEAT = 4;

/**
 * Pesos iniciales recomendados por la spec §9.3, calibrados para que la Fase 2
 * converja sin colapsar en trampas. El feedback humano (Fase 5) ajusta estos
 * pesos — nunca la heurística interna de reward.js.
 */
export const DEFAULT_WEIGHTS: RewardWeights = {
  consonance: 0.25,
  rhythm: 0.2,
  structure: 0.2,
  contour: 0.15,
  physics: 0.1,
  entropy: 0.1,
};
