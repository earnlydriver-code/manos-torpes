import { describe, expect, it } from 'vitest';
import type { TrainConfig } from '../../types/music';
import { DEFAULT_WEIGHTS } from '../constants';
import { GeneticTrainer } from '../genetic';
import { pulseConsistency, scaleInfo } from '../reward-helpers';
import { validateStep } from '../step-validator';

/**
 * Criterio de éxito de la Fase 2 (spec §7): partiendo de azar, en <2000
 * generaciones y <2 min de reloj debe emerger algo con pulso estable y
 * escala reconocible. Este benchmark es el GATE: si falla, se ajustan los
 * pesos de los operadores de mutación — NUNCA el reward.js portado.
 */
describe('benchmark de convergencia @bench', () => {
  it('2000 generaciones: <120 s, pulso >0.6, escala >0.6, todo legal', () => {
    const cfg: TrainConfig = {
      bars: 2,
      tempo: 100,
      populationSize: 64,
      elitism: 6,
      tournamentK: 3,
      crossoverProb: 0.7,
      weights: DEFAULT_WEIGHTS,
      seed: 20260701,
    };
    const trainer = new GeneticTrainer(cfg);
    const t0 = performance.now();
    for (let g = 0; g < 2000; g++) trainer.stepGeneration();
    const elapsedMs = performance.now() - t0;

    const { genome, fitness } = trainer.getBest();
    const midis = genome.steps.flatMap((s) => s.notes.map((n) => n.midi));
    const pulse = pulseConsistency(genome.steps);
    const scale = scaleInfo(midis);

    // eslint-disable-next-line no-console
    console.log(
      `[bench] ${Math.round(elapsedMs)} ms · best=${fitness.toFixed(3)} · pulso=${pulse.toFixed(3)} · escala=${scale.confidence.toFixed(3)} (${scale.root} ${scale.mode}) · notas=${midis.length}`,
    );

    expect(elapsedMs).toBeLessThan(120_000);
    for (const s of genome.steps) expect(validateStep(s.notes).legal).toBe(true);
    expect(fitness).toBeGreaterThan(0.55);
    expect(pulse).toBeGreaterThan(0.6);
    expect(scale.confidence).toBeGreaterThan(0.6);
  });
});
