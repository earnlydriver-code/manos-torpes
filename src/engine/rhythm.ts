import type { Genome, RhythmBank, RhythmPattern } from '../types/music';
import { STEPS_PER_BAR } from './constants';

/**
 * RITMO APRENDIDO (mejora 5, queja del Usuario: "no sabe tener ritmo"):
 * hasta ahora el corpus solo enseñaba MELODÍA (intervalos) y ARMONÍA
 * (acordes) — el ritmo de las piezas reales nunca se inyectaba. Aquí se
 * extraen las figuras rítmicas de cada compás, por mano, y el mutador
 * rhythmLick las re-imprime sobre los genomas.
 */

const MAX_PATTERNS_PER_HAND = 80;
const MIN_ONSETS = 2;
const MAX_ONSETS = 12;

/** Extrae los patrones de onset por compás y mano, ordenados por frecuencia. */
export function extractRhythms(windows: Genome[]): RhythmBank {
  const counts: Record<'R' | 'L', Map<string, { pattern: RhythmPattern; n: number }>> = {
    R: new Map(),
    L: new Map(),
  };
  for (const g of windows) {
    for (let bar = 0; bar < g.bars; bar++) {
      for (const hand of ['R', 'L'] as const) {
        const pattern: RhythmPattern = [];
        for (let offset = 0; offset < STEPS_PER_BAR; offset++) {
          const step = g.steps[bar * STEPS_PER_BAR + offset];
          if (!step) continue;
          const handNotes = step.notes.filter((n) => n.hand === hand);
          if (handNotes.length === 0) continue;
          const dur = Math.max(...handNotes.map((n) => n.durSteps));
          pattern.push([offset, Math.max(1, Math.min(STEPS_PER_BAR, dur))]);
        }
        if (pattern.length < MIN_ONSETS || pattern.length > MAX_ONSETS) continue;
        const key = pattern.map(([s, d]) => `${s}:${d}`).join(',');
        const seen = counts[hand].get(key);
        if (seen) seen.n++;
        else counts[hand].set(key, { pattern, n: 1 });
      }
    }
  }
  const rank = (hand: 'R' | 'L'): RhythmPattern[] =>
    [...counts[hand].values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, MAX_PATTERNS_PER_HAND)
      .map((e) => e.pattern);
  return { R: rank('R'), L: rank('L') };
}
