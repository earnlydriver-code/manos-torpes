/**
 * CONTRATO DE DATOS CONGELADO (spec §9.3).
 * Es el acuerdo entre el motor (engine/), el ML, el worker y la UI.
 * Cambiar cualquier campo requiere decisión conjunta registrada en BITACORA.md.
 */

export type Hand = 'L' | 'R';
export type Finger = 1 | 2 | 3 | 4 | 5;

export type NoteEvent = {
  midi: number; // 36..96 (C2..C7)
  hand: Hand;
  finger: Finger;
  durSteps: number; // duración en semicorcheas, >= 1
  vel: number; // 0..1, dinámica
};

export type Step = { step: number; notes: NoteEvent[] };

/** steps.length === bars * 16 (semicorcheas en 4/4) */
export type Genome = { bars: 2 | 3 | 4; tempo: number; steps: Step[] };

/** Pesos de los componentes de la recompensa. El feedback humano (Fase 5) ajusta ESTO, no la heurística. */
export type RewardWeights = {
  consonance: number;
  rhythm: number;
  structure: number;
  contour: number;
  physics: number;
  entropy: number;
};

export type TrainConfig = {
  bars: 2 | 3 | 4;
  tempo: number; // 60..140 BPM
  populationSize: number;
  elitism: number;
  tournamentK: number;
  crossoverProb: number;
  weights: RewardWeights;
  seed: number;
  /**
   * Arranque en caliente (idea del Usuario, 2026-07-01): piezas guardadas que
   * siembran parte de la población inicial — lo aprendido no se pierde entre
   * corridas. Solo se usan las que coinciden en compases.
   */
  seedGenomes?: Genome[];
};
