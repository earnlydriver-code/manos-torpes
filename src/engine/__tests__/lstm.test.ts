import { describe, expect, it } from 'vitest';
import { trainLstm } from '../../corpus/lstm-train';
import { LstmModel } from '../lstm';
import { INTERVAL_MAX } from '../markov';
import { mulberry32 } from '../rng';

/**
 * Corpus de juguete con estructura LARGA (más allá del orden 3-5 del Markov):
 * una frase de 8 intervalos que se repite — la LSTM debe aprenderla entera.
 */
const PHRASE = [2, 2, 1, -1, -2, 4, -2, -2];
const TOY = Array.from({ length: 8 }, () => [
  ...PHRASE,
  ...PHRASE,
  ...PHRASE,
  ...PHRASE,
]);

describe('LSTM compositora (mejora 3/4)', () => {
  it(
    'entrena, aprende la frase larga y el forward JS puro coincide con TF.js',
    { timeout: 240_000 },
    async () => {
      const json = await trainLstm(TOY);
      expect(json).not.toBeNull();
      const model = new LstmModel(json!);

      // 1. EQUIVALENCIA con TF.js: mismas probabilidades (tolerancia float32).
      const tf = await import('@tensorflow/tfjs');
      const tfModel = tf.sequential();
      tfModel.add(
        tf.layers.embedding({ inputDim: json!.vocab, outputDim: json!.embedDim, inputLength: 8 }),
      );
      tfModel.add(
        tf.layers.lstm({
          units: json!.hidden,
          returnSequences: true,
          activation: 'tanh',
          recurrentActivation: 'sigmoid',
        }),
      );
      tfModel.add(tf.layers.dense({ units: json!.vocab, activation: 'softmax' }));
      tfModel.layers[0].setWeights([tf.tensor(json!.emb)]);
      tfModel.layers[1].setWeights([
        tf.tensor(json!.kernel),
        tf.tensor(json!.recurrent),
        tf.tensor(json!.bias),
      ]);
      tfModel.layers[2].setWeights([tf.tensor(json!.outW), tf.tensor(json!.outB)]);

      const context = PHRASE; // 8 intervalos
      const symbols = context.map((iv) => iv + INTERVAL_MAX);
      const tfOut = tfModel.predict(tf.tensor2d([symbols], [1, 8], 'int32')) as {
        array(): Promise<number[][][]>;
      };
      const tfProbs = (await tfOut.array())[0][7]; // predicción tras el 8º símbolo
      const jsProbs = model.probs(context);
      for (let v = 0; v < json!.vocab; v++) {
        expect(Math.abs(jsProbs[v] - tfProbs[v])).toBeLessThan(1e-4);
      }
      tfModel.dispose();

      // 2. APRENDIZAJE: la frase del corpus es más probable que el ruido.
      expect(model.avgLogProb([...PHRASE, ...PHRASE])).toBeGreaterThan(
        model.avgLogProb([9, -14, 3, 17, -6, 11, -19, 8]),
      );

      // 3. GENERACIÓN con memoria: tras el contexto de la frase, el intervalo
      // que la frase dicta tiene probabilidad MUY por encima del azar.
      // (El init de TF.js no va sembrado: la aserción mide "aprendió", no
      // exige el argmax exacto de una corrida concreta.)
      const expected = PHRASE[0]; // la frase se repite: tras ella viene su inicio
      const dist = model.probs(PHRASE);
      const pExpected = dist[expected + INTERVAL_MAX];
      expect(pExpected).toBeGreaterThan(5 / dist.length); // ≥5x el azar (1/49)
      const rank = dist.filter((p) => p > pExpected).length;
      expect(rank).toBeLessThan(3); // entre los 3 intervalos más probables

      // 4. DETERMINISMO tras serializar (JSON round-trip).
      const revived = LstmModel.fromJSON(JSON.parse(JSON.stringify(json)));
      const a = mulberry32(7);
      const b = mulberry32(7);
      expect(revived.sample(a, PHRASE)).toBe(model.sample(b, PHRASE));
      expect(revived.avgLogProb(PHRASE)).toBeCloseTo(model.avgLogProb(PHRASE), 12);
    },
  );

  it('con corpus demasiado pequeño devuelve null (fallback a Markov, como la spec)', async () => {
    expect(await trainLstm([[2, 2]])).toBeNull();
    expect(await trainLstm([])).toBeNull();
  });
});
