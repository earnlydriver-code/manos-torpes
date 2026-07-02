import type { LstmJson } from '../types/music';
import { LstmModel } from '../engine/lstm';
import { INTERVAL_MAX } from '../engine/markov';

/**
 * Entrenamiento de la LSTM compositora (mejora 3/4) con TF.js — import
 * dinámico para que sus ~1.4 MB no carguen hasta que haya corpus. Se entrena
 * UNA vez por corpus (segundos) y los pesos viajan como JSON al worker,
 * donde corre el forward puro JS de engine/lstm.ts.
 */

const VOCAB = INTERVAL_MAX * 2 + 1; // 49 intervalos: -24..+24
const EMBED = 10;
const HIDDEN = 20; // ~11k parámetros: muy por debajo del tope de la spec (<100k)
const WINDOW = 12;
const STRIDE = 3;
const MIN_WINDOWS = 4;

function toSymbols(seq: number[]): number[] {
  return seq.map((iv) => Math.max(-INTERVAL_MAX, Math.min(INTERVAL_MAX, iv)) + INTERVAL_MAX);
}

/** Entropía de la distribución global de símbolos (para la defensa de diversidad). */
function distributionEntropy(sequences: number[][]): number {
  const counts = new Map<number, number>();
  let total = 0;
  for (const seq of sequences)
    for (const s of toSymbols(seq)) {
      counts.set(s, (counts.get(s) ?? 0) + 1);
      total++;
    }
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

export type LstmProgress = (epoch: number, epochs: number) => void;

/**
 * Entrena y devuelve los pesos listos para el worker, o null si el corpus es
 * demasiado pequeño para una LSTM honesta (fallback a Markov, como la spec).
 */
export async function trainLstm(
  sequences: number[][],
  onProgress?: LstmProgress,
): Promise<LstmJson | null> {
  const windows: number[][] = [];
  for (const seq of sequences) {
    const symbols = toSymbols(seq);
    for (let start = 0; start + WINDOW + 1 <= symbols.length; start += STRIDE) {
      windows.push(symbols.slice(start, start + WINDOW + 1));
    }
  }
  if (windows.length < MIN_WINDOWS) return null;

  const tf = await import('@tensorflow/tfjs');
  const epochs = Math.min(60, Math.max(25, Math.round(2500 / windows.length)));

  const xs = tf.tensor2d(windows.map((w) => w.slice(0, WINDOW)), [windows.length, WINDOW], 'int32');
  const ysLabels = windows.map((w) => w.slice(1));
  const ys = tf.oneHot(tf.tensor2d(ysLabels, [windows.length, WINDOW], 'int32'), VOCAB);

  const model = tf.sequential();
  model.add(
    tf.layers.embedding({ inputDim: VOCAB, outputDim: EMBED, inputLength: WINDOW }),
  );
  model.add(
    tf.layers.lstm({
      units: HIDDEN,
      returnSequences: true,
      activation: 'tanh',
      recurrentActivation: 'sigmoid', // el forward JS puro replica exactamente esto
    }),
  );
  model.add(tf.layers.dense({ units: VOCAB, activation: 'softmax' }));
  model.compile({ optimizer: tf.train.adam(0.02), loss: 'categoricalCrossentropy' });

  await model.fit(xs, ys, {
    epochs,
    batchSize: 32,
    shuffle: true,
    verbose: 0,
    callbacks: { onEpochEnd: (epoch) => onProgress?.(epoch + 1, epochs) },
  });

  const [emb] = model.layers[0].getWeights();
  const [kernel, recurrent, bias] = model.layers[1].getWeights();
  const [outW, outB] = model.layers[2].getWeights();
  const json: LstmJson = {
    vocab: VOCAB,
    embedDim: EMBED,
    hidden: HIDDEN,
    emb: (await emb.array()) as number[][],
    kernel: (await kernel.array()) as number[][],
    recurrent: (await recurrent.array()) as number[][],
    bias: (await bias.array()) as number[],
    outW: (await outW.array()) as number[][],
    outB: (await outB.array()) as number[],
    refLogP: 0,
    uniformLogP: -Math.log(VOCAB),
    refEntropy: distributionEntropy(sequences),
  };
  xs.dispose();
  ys.dispose();
  model.dispose();

  // refLogP con el MISMO forward que usará el worker (coherencia garantizada).
  const pure = new LstmModel(json);
  const scores = sequences.filter((s) => s.length >= 2).map((s) => pure.avgLogProb(s));
  json.refLogP =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : json.uniformLogP;
  return json;
}
