import { describe, expect, it } from 'vitest';
import type { Finger, Step } from '../../types/music';
import {
  detectScaleKrumhansl,
  entropy,
  histogram,
  melodicContour,
  ngramSelfSimilarity,
  pulseConsistency,
  scaleInfo,
  travelPenalty,
} from '../reward-helpers';
import { mulberry32, randInt } from '../rng';
import { emptySeq, note } from './helpers';

describe('histogram + entropy', () => {
  it('histogram vacío devuelve 12 ceros (no NaN)', () => {
    expect(histogram([])).toEqual(new Array(12).fill(0));
  });

  it('histogram normaliza a suma 1', () => {
    const h = histogram([0, 0, 7]);
    expect(h[0]).toBeCloseTo(2 / 3);
    expect(h[7]).toBeCloseTo(1 / 3);
    expect(h.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('entropía: una sola clase = 0 bits; 50/50 = 1 bit; uniforme 12 ≈ 3.585', () => {
    expect(entropy([1, 0, 0])).toBe(0);
    expect(entropy([0.5, 0.5, 0])).toBe(1);
    expect(entropy(new Array(12).fill(1 / 12))).toBeCloseTo(Math.log2(12), 2);
  });

  it('el umbral anti-trampa de 1.2 bits: dos notas 50/50 suspenden, tres equilibradas aprueban', () => {
    expect(entropy(histogram([60, 64, 60, 64].map((m) => m % 12)))).toBeLessThan(1.2);
    expect(entropy(histogram([60, 64, 67].map((m) => m % 12)))).toBeGreaterThan(1.2);
  });
});

describe('detectScaleKrumhansl', () => {
  const cMajorScale = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 72, 67, 64, 60];

  it('detecta Do mayor (o su relativa La menor: mismas notas) con confianza alta', () => {
    const info = scaleInfo(cMajorScale);
    const esDoMayor = info.root === 0 && info.mode === 'major';
    const esLaMenor = info.root === 9 && info.mode === 'minor';
    expect(esDoMayor || esLaMenor).toBe(true);
    expect(info.confidence).toBeGreaterThan(0.6);
  });

  it('el Set devuelto contiene los 7 grados diatónicos y excluye los cromáticos', () => {
    const scale = detectScaleKrumhansl(cMajorScale);
    for (const pc of [0, 2, 4, 5, 7, 9, 11]) expect(scale.has(pc)).toBe(true);
    for (const pc of [1, 3, 6, 8, 10]) expect(scale.has(pc)).toBe(false);
  });

  it('sin notas devuelve una escala por defecto utilizable', () => {
    const scale = detectScaleKrumhansl([]);
    expect(scale.size).toBe(7);
  });
});

describe('pulseConsistency', () => {
  it('onsets exactos cada 4 pasos puntúan alto (≥0.8)', () => {
    const seq = emptySeq(32);
    for (let t = 0; t < 32; t += 4) seq[t].notes.push(note(60 + (t % 12), 'R', 3));
    expect(pulseConsistency(seq)).toBeGreaterThanOrEqual(0.8);
  });

  it('onsets aleatorios puntúan claramente peor que el pulso regular', () => {
    const rng = mulberry32(1234);
    const seq = emptySeq(32);
    for (let t = 0; t < 32; t++) {
      if (rng() < 0.3) seq[t].notes.push(note(randInt(rng, 50, 80), 'R', 3, 1, 0.3 + rng() * 0.7));
    }
    const regular = emptySeq(32);
    for (let t = 0; t < 32; t += 4) regular[t].notes.push(note(60, 'R', 3));
    expect(pulseConsistency(seq)).toBeLessThan(pulseConsistency(regular));
  });

  it('menos de 3 onsets no puntúa (sin pulso no hay groove)', () => {
    const seq = emptySeq(32);
    seq[0].notes.push(note(60, 'R', 1));
    seq[16].notes.push(note(64, 'R', 2));
    expect(pulseConsistency(seq)).toBe(0);
  });
});

describe('ngramSelfSimilarity', () => {
  function motifBar(steps: Step[], startStep: number, transpose: number) {
    const motif = [60, 64, 67, 64];
    motif.forEach((midi, i) => {
      steps[startStep + i * 4].notes.push(note(midi + transpose, 'R', ((i % 5) + 1) as Finger));
    });
  }

  it('la repetición transportada cuenta como variada, la idéntica como literal', () => {
    const literal = emptySeq(32);
    motifBar(literal, 0, 0);
    motifBar(literal, 16, 0);
    const varied = emptySeq(32);
    motifBar(varied, 0, 0);
    motifBar(varied, 16, 2);

    const litResult = ngramSelfSimilarity(literal, 4);
    const varResult = ngramSelfSimilarity(varied, 4);
    expect(litResult.literalReps).toBeGreaterThan(varResult.literalReps);
    expect(varResult.variedReps).toBeGreaterThan(0);

    // La fórmula de estructura del reward.js portado debe preferir la variación:
    const structure = (r: { variedReps: number; literalReps: number }) =>
      Math.tanh(r.variedReps * 0.3) - Math.max(0, r.literalReps - 2) * 0.1;
    expect(structure(varResult)).toBeGreaterThan(structure(litResult));
  });
});

describe('melodicContour', () => {
  it('una escala por grados puntúa alto', () => {
    const seq = emptySeq(32);
    const melody = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60, 62];
    melody.forEach((m, i) => seq[i * 2].notes.push(note(m, 'R', 3)));
    expect(melodicContour(seq)).toBeGreaterThan(0.7);
  });

  it('saltos grandes sin compensar puntúan bajo', () => {
    const seq = emptySeq(32);
    const melody = [60, 72, 61, 75, 50, 78, 52, 80];
    melody.forEach((m, i) => seq[i * 4].notes.push(note(m, 'R', 3)));
    expect(melodicContour(seq)).toBeLessThan(0.4);
  });

  it('menos de 3 onsets melódicos no puntúa', () => {
    const seq = emptySeq(16);
    seq[0].notes.push(note(60, 'R', 1));
    expect(melodicContour(seq)).toBe(0);
  });
});

describe('travelPenalty', () => {
  it('una mano quieta no paga viaje', () => {
    const seq = emptySeq(32);
    for (let t = 0; t < 32; t += 2) seq[t].notes.push(note(60, 'R', 3));
    expect(travelPenalty(seq)).toBe(0);
  });

  it('saltos de dos octavas por beat saturan la penalización', () => {
    const seq = emptySeq(32);
    for (let t = 0; t < 32; t += 4) {
      seq[t].notes.push(note(t % 8 === 0 ? 48 : 72, 'R', 3));
    }
    expect(travelPenalty(seq)).toBeGreaterThan(0.5);
  });
});
