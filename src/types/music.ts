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

/**
 * Modelo de Markov serializado (Etapa 2). Contexto = intervalos previos de la
 * voz superior; tables[k] = conteos para contextos de longitud k.
 */
export type MarkovJson = {
  order: number;
  refLogP: number; // logP promedio del propio corpus (techo de la similitud)
  uniformLogP: number; // logP de elegir al azar (suelo de la similitud)
  tables: Record<string, Record<string, number>>[];
};

/** Modelo de progresiones de acordes serializado (mejora 1/4). */
export type ChordModelJson = {
  refLogP: number;
  transitions: Record<string, Record<string, number>>;
};

/**
 * LSTM pequeña serializada (mejora 3/4, spec §2: "LSTM pequeña en TF.js,
 * fallback a Markov puro"). Se entrena con TF.js en el hilo principal y se
 * ejecuta con un forward puro JS en el worker (determinista y rápido).
 * Pesos con el layout de tf.layers.lstm: puertas en orden i,f,g,o.
 */
export type LstmJson = {
  vocab: number;
  embedDim: number;
  hidden: number;
  emb: number[][]; // [vocab][embedDim]
  kernel: number[][]; // [embedDim][4*hidden]
  recurrent: number[][]; // [hidden][4*hidden]
  bias: number[]; // [4*hidden]
  outW: number[][]; // [hidden][vocab]
  outB: number[]; // [vocab]
  refLogP: number;
  uniformLogP: number;
  refEntropy: number;
};

export type CorpusConfig = {
  model: MarkovJson;
  /** Peso de la similitud al corpus en la recompensa mezclada (0..1). */
  alpha: number;
  /** Progresiones de acordes aprendidas del corpus (opcional). */
  chords?: ChordModelJson;
  /** LSTM generadora de frases largas (opcional; sin ella, Markov compone). */
  lstm?: LstmJson;
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
  /** Etapa 2 «Estudiante»: mezcla la recompensa con similitud al corpus. */
  corpus?: CorpusConfig;
};
