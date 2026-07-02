import type { RewardWeights, Step } from '../types/music';
import { DEFAULT_WEIGHTS } from './constants';
import {
  avgStrain,
  detectScaleKrumhansl,
  entropy,
  histogram,
  melodicContour,
  ngramSelfSimilarity,
  pulseConsistency,
  travelPenalty,
} from './reward-helpers';

/**
 * Desglose de la recompensa para la UI (panel de aprendizaje, spec §6.3).
 * ESPEJO EXACTO de la fórmula del reward.js portado usando los mismos helpers —
 * reward.js sigue siendo la fuente de verdad y no se toca; un test de propiedad
 * garantiza que `total` coincide con musicalReward en todos los modos.
 */

export type BreakdownMode = 'silencio' | 'entropia-baja' | 'completo';

export type RewardComponents = {
  consonance: number;
  rhythm: number;
  structure: number;
  contour: number;
  physics: number;
  entropy: number;
};

export type RewardBreakdown = {
  mode: BreakdownMode;
  total: number;
  components: RewardComponents; // puntuaciones crudas (sin pesos)
};

const ZERO: RewardComponents = {
  consonance: 0,
  rhythm: 0,
  structure: 0,
  contour: 0,
  physics: 0,
  entropy: 0,
};

export function rewardBreakdown(seq: Step[], w: RewardWeights = DEFAULT_WEIGHTS): RewardBreakdown {
  const notes = seq.flatMap((s) => s.notes.map((n) => n.midi));
  if (notes.length === 0) return { mode: 'silencio', total: -1, components: { ...ZERO } };

  const pitchEntropy = entropy(histogram(notes.map((m) => m % 12)));
  if (pitchEntropy < 1.2) {
    return {
      mode: 'entropia-baja',
      total: -0.5 + pitchEntropy * 0.2,
      components: { ...ZERO, entropy: Math.min(pitchEntropy / 2.5, 1) },
    };
  }

  const { variedReps, literalReps } = ngramSelfSimilarity(seq, 4);
  const structure = Math.tanh(variedReps * 0.3) - Math.max(0, literalReps - 2) * 0.1;

  const scale = detectScaleKrumhansl(notes);
  const inScale = notes.filter((m) => scale.has(m % 12)).length / notes.length;
  const consonance = 1 - Math.abs(inScale - 0.85) * 2.5;

  const rhythm = pulseConsistency(seq);
  const contour = melodicContour(seq);
  const physics = -avgStrain(seq) - travelPenalty(seq);
  const entropyScore = Math.min(pitchEntropy / 2.5, 1);

  return {
    mode: 'completo',
    total:
      w.consonance * consonance +
      w.rhythm * rhythm +
      w.structure * structure +
      w.contour * contour +
      w.physics * physics +
      w.entropy * entropyScore,
    components: { consonance, rhythm, structure, contour, physics, entropy: entropyScore },
  };
}
