import type { Genome } from '../types/music';

/**
 * Sugerencia automática de tempo y compases a partir del corpus (idea del
 * Usuario, 2026-07-02: "que eso él lo decida de alguna manera lógica").
 *
 * - Tempo: la mediana del tempo REAL de las piezas (el MIDI lo trae en la
 *   cabecera; el audio se estimó al importar). Mediana y no promedio: una
 *   pieza rapidísima no arrastra a todas.
 * - Compases: por densidad de ataques. Música densa llena 2 compases con
 *   material de sobra; música lenta y espaciada necesita 4 para decir una
 *   frase completa.
 */

export type CorpusLike = {
  bpm?: number;
  windows: Genome[];
  windowsByBars?: { 2: Genome[]; 3: Genome[]; 4: Genome[] };
};

export type TrainingSuggestion = { tempo: number; bars: 2 | 3 | 4; reason: string };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function suggestTraining(pieces: CorpusLike[]): TrainingSuggestion | null {
  const usable = pieces.filter(
    (p) => (p.windowsByBars?.[2] ?? p.windows).length > 0 || p.windows.length > 0,
  );
  if (usable.length === 0) return null;

  // Tempo: mediana de los tempos reales, acotada al rango de la app.
  const bpms = usable.map((p) => p.bpm ?? p.windows[0]?.tempo ?? 100);
  const tempo = Math.round(Math.max(60, Math.min(140, median(bpms))));

  // Densidad: steps con ataque por compás, promediada sobre las ventanas.
  let onsetSteps = 0;
  let barCount = 0;
  for (const p of usable) {
    for (const g of p.windowsByBars?.[2] ?? p.windows) {
      onsetSteps += g.steps.filter((s) => s.notes.length > 0).length;
      barCount += g.bars;
    }
  }
  const density = barCount > 0 ? onsetSteps / barCount : 8;

  const bars: 2 | 3 | 4 = density >= 8 ? 2 : density >= 5 ? 3 : 4;
  const reason =
    bars === 2
      ? `música densa (${density.toFixed(1)} ataques/compás): frases cortas bastan`
      : bars === 4
        ? `música espaciada (${density.toFixed(1)} ataques/compás): la frase necesita aire`
        : `densidad media (${density.toFixed(1)} ataques/compás)`;

  return { tempo, bars, reason: `~${tempo} BPM (mediana del corpus) · ${reason}` };
}
