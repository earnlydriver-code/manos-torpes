import type { Genome, RewardWeights, TrainConfig } from '../types/music';

/**
 * Contrato de mensajes main ↔ worker. Uniones discriminadas estrictas; el
 * genoma viaja por structured clone (JSON plano y pequeño, no hacen falta
 * Transferables). `setWeights` queda reservado para la Fase 5 (bandit RLHF).
 */

export type MainToWorker =
  | { type: 'init'; config: TrainConfig }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'setThrottle'; genPerSecond: number | null } // null = a toda velocidad
  | { type: 'setWeights'; weights: RewardWeights }
  | { type: 'requestSnapshot' };

export type WorkerToMain =
  | { type: 'ready' }
  | { type: 'progress'; gen: number; best: number; avg: number }
  | { type: 'newBest'; gen: number; reward: number; genome: Genome }
  | { type: 'snapshot'; gen: number; reward: number; genome: Genome }
  | { type: 'paused'; gen: number }
  | { type: 'stopped' }
  | { type: 'error'; message: string };
