import { describe, expect, it } from 'vitest';
import { MarkovModel, melodyIntervals } from '../markov';
import { mulberry32 } from '../rng';
import { emptySeq, note } from './helpers';

// Corpus de juguete: escalas ascendentes por grados (intervalos +2/+1 típicos).
const SCALE_RUNS = [
  [2, 2, 1, 2, 2, 2, 1],
  [2, 2, 1, 2, 2, 2, 1],
  [2, 1, 2, 2, 1, 2, 2],
  [-2, -2, -1, -2, -2, -2, -1],
];

describe('MarkovModel', () => {
  it('puntúa más alto lo que se parece al corpus que el ruido', () => {
    const model = new MarkovModel(3);
    model.train(SCALE_RUNS);
    const likeCorpus = model.avgLogProb([2, 2, 1, 2, 2]);
    const noise = model.avgLogProb([11, -7, 23, -18, 5]);
    expect(likeCorpus).toBeGreaterThan(noise);
  });

  it('refLogP queda por encima del suelo uniforme tras entrenar', () => {
    const model = new MarkovModel(3);
    model.train(SCALE_RUNS);
    expect(model.refLogP).toBeGreaterThan(model.uniformLogP);
  });

  it('sample con semilla es determinista y favorece los intervalos del corpus', () => {
    const model = new MarkovModel(3);
    model.train(SCALE_RUNS);
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => model.sample(a, [2, 2]));
    const seqB = Array.from({ length: 20 }, () => model.sample(b, [2, 2]));
    expect(seqA).toEqual(seqB);
    // Con contexto [2,2] el corpus siempre sigue con 1 o 2.
    for (const s of seqA) expect([1, 2]).toContain(s);
  });

  it('sobrevive a serializar y deserializar (mismos logP y samples)', () => {
    const model = new MarkovModel(3);
    model.train(SCALE_RUNS);
    const revived = MarkovModel.fromJSON(JSON.parse(JSON.stringify(model.toJSON())));
    expect(revived.avgLogProb([2, 2, 1])).toBeCloseTo(model.avgLogProb([2, 2, 1]), 12);
    expect(revived.refLogP).toBeCloseTo(model.refLogP, 12);
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect(revived.sample(a, [2])).toBe(model.sample(b, [2]));
  });

  it('melodyIntervals extrae la voz superior DE LA MANO DERECHA', () => {
    const seq = emptySeq(16);
    seq[0].notes.push(note(60, 'R', 1), note(48, 'L', 5)); // top R: 60
    seq[4].notes.push(note(64, 'R', 3)); // +4
    seq[8].notes.push(note(62, 'R', 2)); // -2
    expect(melodyIntervals(seq)).toEqual([4, -2]);
  });

  it('regresión ping-pong: los steps solo-izquierda NO contaminan la melodía', () => {
    // El bug: cuando la derecha descansa, "la nota más aguda" era el bajo y
    // aparecían saltos falsos de dos octavas en la melodía aprendida.
    const seq = emptySeq(16);
    seq[0].notes.push(note(84, 'R', 5));
    seq[2].notes.push(note(48, 'L', 5)); // bajo solo: antes metía -36→clamp -24
    seq[4].notes.push(note(83, 'R', 4));
    seq[6].notes.push(note(50, 'L', 3)); // bajo solo
    seq[8].notes.push(note(81, 'R', 3));
    expect(melodyIntervals(seq)).toEqual([-1, -2]); // solo la derecha
  });
});
