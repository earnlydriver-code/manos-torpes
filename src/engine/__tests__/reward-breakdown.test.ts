import { describe, expect, it } from 'vitest';
import { randomGenome } from '../genome';
import { musicalReward } from '../reward';
import { rewardBreakdown } from '../reward-breakdown';
import { mulberry32 } from '../rng';
import { emptySeq, note } from './helpers';

describe('rewardBreakdown — espejo exacto del reward.js portado', () => {
  it('coincide con musicalReward en 50 genomas aleatorios', () => {
    const rng = mulberry32(97531);
    for (let i = 0; i < 50; i++) {
      const g = randomGenome(rng, { bars: 2, tempo: 100 });
      expect(rewardBreakdown(g.steps).total).toBeCloseTo(musicalReward(g.steps), 12);
    }
  });

  it('silencio total: modo silencio, total -1', () => {
    const b = rewardBreakdown(emptySeq(32));
    expect(b.mode).toBe('silencio');
    expect(b.total).toBe(-1);
    expect(b.total).toBe(musicalReward(emptySeq(32)));
  });

  it('una nota repetida: modo entropía-baja, total idéntico al portado', () => {
    const seq = emptySeq(32);
    for (let t = 0; t < 32; t++) seq[t].notes.push(note(60, 'R', 1));
    const b = rewardBreakdown(seq);
    expect(b.mode).toBe('entropia-baja');
    expect(b.total).toBe(musicalReward(seq));
  });

  it('la suma ponderada de componentes reproduce el total en modo completo', () => {
    const rng = mulberry32(2222);
    const g = randomGenome(rng, { bars: 2, tempo: 100 });
    const b = rewardBreakdown(g.steps);
    if (b.mode === 'completo') {
      const w = { consonance: 0.25, rhythm: 0.2, structure: 0.2, contour: 0.15, physics: 0.1, entropy: 0.1 };
      const sum =
        w.consonance * b.components.consonance +
        w.rhythm * b.components.rhythm +
        w.structure * b.components.structure +
        w.contour * b.components.contour +
        w.physics * b.components.physics +
        w.entropy * b.components.entropy;
      expect(sum).toBeCloseTo(b.total, 12);
    }
  });
});
