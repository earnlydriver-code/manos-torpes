import { describe, expect, it } from 'vitest';
import type { TrainConfig } from '../../types/music';
import { DEFAULT_WEIGHTS } from '../constants';
import { blendedReward, corpusSimilarity } from '../corpus-blend';
import { GeneticTrainer } from '../genetic';
import { randomGenome } from '../genome';
import { MarkovModel } from '../markov';
import { musicalReward } from '../reward';
import { mulberry32 } from '../rng';
import { validateStep } from '../step-validator';
import { emptySeq, note } from './helpers';

/** Corpus de juguete: melodías por grados con arpegios ocasionales. */
function toyModel(): MarkovModel {
  const model = new MarkovModel(3);
  model.train([
    [2, 2, 1, 2, 2, 2, 1],
    [2, 2, 1, -1, -2, -2, 2],
    [4, 3, -2, -2, 2, 1, -1],
    [-2, -2, -1, 2, 2, 1, 2],
  ]);
  return model;
}

function melodicGenomeSteps(intervals: number[]) {
  const seq = emptySeq(32);
  let midi = 64;
  seq[0].notes.push(note(midi, 'R', 3, 2));
  intervals.forEach((iv, i) => {
    midi += iv;
    seq[(i + 1) * 2].notes.push(note(midi, 'R', 3, 2));
  });
  return seq;
}

describe('corpusSimilarity + blendedReward', () => {
  it('una melodía por grados se parece más al corpus que saltos aleatorios', () => {
    const model = toyModel();
    const stepwise = melodicGenomeSteps([2, 2, 1, 2, 2, 2, 1]);
    const jumpy = melodicGenomeSteps([11, -9, 14, -17, 13, -8, 16]);
    expect(corpusSimilarity(stepwise, model)).toBeGreaterThan(corpusSimilarity(jumpy, model));
    // 0.35 y no 0.5: el factor de diversidad (anti ping-pong) descuenta a las
    // melodías de solo dos tipos de intervalo, aunque sean muy probables.
    expect(corpusSimilarity(stepwise, model)).toBeGreaterThan(0.35);
    // Una melodía con la variedad del corpus sí puntúa alto.
    const rich = melodicGenomeSteps([2, 2, 1, -1, -2, 4, 3, -2, -2, 2, 1, 2]);
    expect(corpusSimilarity(rich, model)).toBeGreaterThan(0.5);
  });

  it('sin material melódico (<4 intervalos) la similitud es 0', () => {
    const model = toyModel();
    const seq = emptySeq(32);
    seq[0].notes.push(note(60, 'R', 1));
    seq[4].notes.push(note(64, 'R', 3));
    expect(corpusSimilarity(seq, model)).toBe(0);
  });

  it('las trampas del reward portado se respetan sin diluir', () => {
    const model = toyModel();
    // Silencio total: -1 exacto, sin mezclar.
    expect(blendedReward(emptySeq(32), model, 0.35)).toBe(-1);
    // Una nota repetida: castigo de entropía intacto.
    const oneNote = emptySeq(32);
    for (let t = 0; t < 32; t++) oneNote[t].notes.push(note(60, 'R', 1));
    expect(blendedReward(oneNote, model, 0.35)).toBe(musicalReward(oneNote));
  });

  it('la mezcla premia sonar como el corpus (mismo genoma, similitud manda)', () => {
    const model = toyModel();
    const stepwise = melodicGenomeSteps([2, 2, 1, 2, 2, 2, 1]);
    const base = musicalReward(stepwise);
    const blended = blendedReward(stepwise, model, 0.35);
    // Con similitud > base, la mezcla sube la nota del genoma corpus-like.
    if (corpusSimilarity(stepwise, model) > base) expect(blended).toBeGreaterThan(base);
    expect(blended).toBeCloseTo(
      0.65 * base + 0.35 * corpusSimilarity(stepwise, model),
      12,
    );
  });
});

describe('anti-exploit de similitud (bug cazado por el Usuario, 2026-07-02)', () => {
  it('un bucle degenerado de 2 intervalos NO puede puntuar como el corpus', () => {
    // Corpus con algunos saltos grandes (como la cuantización real produce).
    const model = new MarkovModel(3);
    model.train([
      [2, 2, 1, -24, 24, -2, 2, 1],
      [2, -5, -2, -24, 24, 8, -1, 3],
      [4, 3, -2, -22, 23, 2, 1, -1],
      [-2, -2, -1, 2, 24, -24, 1, 2],
    ]);
    // El exploit que el agente encontró: ping-pong ±24 en bucle infinito.
    const pingPong = emptySeq(32);
    let high = true;
    for (let t = 0; t < 32; t += 2) {
      pingPong[t].notes.push(note(high ? 84 : 60, 'R', high ? 5 : 1));
      high = !high;
    }
    const exploit = corpusSimilarity(pingPong, model);
    // Y una melodía honesta con la variedad del corpus.
    const honest = melodicGenomeSteps([2, 2, 1, -24, 24, -2, 2, 1, 4, 3, -2]);
    expect(exploit).toBeLessThan(0.45); // el factor de diversidad lo aplasta
    expect(corpusSimilarity(honest, model)).toBeGreaterThan(exploit);
  });
});

describe('GeneticTrainer con corpus (Etapa 2)', () => {
  const cfg: TrainConfig = {
    bars: 2,
    tempo: 100,
    populationSize: 64,
    elitism: 6,
    tournamentK: 3,
    crossoverProb: 0.7,
    weights: DEFAULT_WEIGHTS,
    seed: 13579,
  };

  it('entrena legal y mejora con el mutador de licks del corpus activo', () => {
    const trainer = new GeneticTrainer({
      ...cfg,
      corpus: { model: toyModel().toJSON(), alpha: 0.35 },
    });
    const initial = trainer.stats().best;
    for (let g = 0; g < 150; g++) trainer.stepGeneration();
    const { genome, fitness } = trainer.getBest();
    expect(fitness).toBeGreaterThan(initial);
    for (const s of genome.steps) expect(validateStep(s.notes).legal).toBe(true);
  });

  it('con corpus, el mejor termina melódicamente más cerca del corpus que un genoma aleatorio', () => {
    const model = toyModel();
    const trainer = new GeneticTrainer({
      ...cfg,
      seed: 8642,
      corpus: { model: model.toJSON(), alpha: 0.35 },
    });
    for (let g = 0; g < 300; g++) trainer.stepGeneration();
    const best = trainer.getBest().genome;
    const rng = mulberry32(1);
    const randoms = Array.from({ length: 10 }, () => randomGenome(rng, { bars: 2, tempo: 100 }));
    const avgRandomSim =
      randoms.reduce((acc, g) => acc + corpusSimilarity(g.steps, model), 0) / randoms.length;
    expect(corpusSimilarity(best.steps, model)).toBeGreaterThan(avgRandomSim);
  });

  it('es reproducible también con corpus (misma semilla, misma curva)', () => {
    const corpus = { model: toyModel().toJSON(), alpha: 0.35 };
    const a = new GeneticTrainer({ ...cfg, seed: 777, corpus });
    const b = new GeneticTrainer({ ...cfg, seed: 777, corpus });
    for (let g = 0; g < 15; g++) expect(a.stepGeneration().best).toBe(b.stepGeneration().best);
  });
});
