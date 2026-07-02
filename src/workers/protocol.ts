import type { RewardBreakdown } from '../engine/reward-breakdown';
import type { Genome, RewardWeights, TrainConfig } from '../types/music';

/**
 * Contrato de mensajes main ↔ worker. Uniones discriminadas estrictas; el
 * genoma viaja por structured clone (JSON plano y pequeño, no hacen falta
 * Transferables). `setWeights` queda reservado para la Fase 5 (bandit RLHF).
 *
 * `runId` sella cada corrida: el main lo incrementa en cada init/reset y
 * descarta mensajes de corridas viejas — sin él, un 'progress' en vuelo
 * repuebla el estado que reset() acaba de limpiar (hallazgo de la revisión).
 */

export type MainToWorker =
  | { type: 'init'; config: TrainConfig; runId: number }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'setThrottle'; genPerSecond: number | null } // null = a toda velocidad
  | { type: 'setWeights'; weights: RewardWeights }
  | { type: 'requestSnapshot' };

export type WorkerToMain =
  | { type: 'ready' }
  | { type: 'progress'; runId: number; gen: number; best: number; avg: number }
  | {
      type: 'newBest';
      runId: number;
      gen: number;
      reward: number;
      genome: Genome;
      breakdown: RewardBreakdown;
    }
  | {
      type: 'snapshot'; // instantánea del mejor cada N gens — alimenta el timeline
      runId: number;
      gen: number;
      reward: number;
      genome: Genome;
      breakdown: RewardBreakdown;
    }
  | { type: 'paused'; runId: number; gen: number }
  | { type: 'stopped' }
  | { type: 'error'; message: string };
