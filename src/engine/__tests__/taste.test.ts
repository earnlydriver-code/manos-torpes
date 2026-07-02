import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS } from '../constants';
import type { RewardComponents } from '../reward-breakdown';
import { WEIGHT_KEYS, defaultTaste, updateWeights } from '../taste';

const rhythmHeavy: RewardComponents = {
  consonance: 0.2,
  rhythm: 0.9,
  structure: 0.2,
  contour: 0.2,
  physics: 0.2,
  entropy: 0.2,
};

function sum(w: Record<string, number>): number {
  return WEIGHT_KEYS.reduce((acc, k) => acc + w[k], 0);
}

describe('updateWeights (Etapa 3 — el gusto ajusta pesos, no la heurística)', () => {
  it('👍 a algo rítmico sube el peso del ritmo; 👎 lo baja', () => {
    const liked = updateWeights(DEFAULT_WEIGHTS, rhythmHeavy, 1);
    expect(liked.rhythm).toBeGreaterThan(DEFAULT_WEIGHTS.rhythm);
    const disliked = updateWeights(DEFAULT_WEIGHTS, rhythmHeavy, -1);
    expect(disliked.rhythm).toBeLessThan(DEFAULT_WEIGHTS.rhythm);
  });

  it('los pesos siempre suman 1', () => {
    let w = { ...DEFAULT_WEIGHTS };
    for (let i = 0; i < 30; i++) w = updateWeights(w, rhythmHeavy, i % 3 === 0 ? -1 : 1);
    expect(sum(w)).toBeCloseTo(1, 10);
  });

  it('ningún componente muere ni domina, aunque insistas 100 veces', () => {
    let w = { ...DEFAULT_WEIGHTS };
    for (let i = 0; i < 100; i++) w = updateWeights(w, rhythmHeavy, 1);
    for (const k of WEIGHT_KEYS) {
      expect(w[k]).toBeGreaterThan(0.02); // las defensas anti-trampa siguen vivas
      expect(w[k]).toBeLessThan(0.5); // el gusto matiza, no reescribe
    }
    expect(w.rhythm).toBeGreaterThan(w.consonance);
    expect(sum(w)).toBeCloseTo(1, 10);
  });

  it('componentes idénticos entre sí no mueven nada (no hay señal)', () => {
    const flat: RewardComponents = {
      consonance: 0.5,
      rhythm: 0.5,
      structure: 0.5,
      contour: 0.5,
      physics: 0.5,
      entropy: 0.5,
    };
    const w = updateWeights(DEFAULT_WEIGHTS, flat, 1);
    for (const k of WEIGHT_KEYS) expect(w[k]).toBeCloseTo(DEFAULT_WEIGHTS[k], 10);
  });

  it('defaultTaste parte de los pesos de la spec', () => {
    const t = defaultTaste();
    expect(t.weights).toEqual(DEFAULT_WEIGHTS);
    expect(t.ratings).toBe(0);
  });
});
