import type { Taste } from '../engine/taste';
import { defaultTaste } from '../engine/taste';
import { WEIGHT_KEYS } from '../engine/taste';
import {
  listCorpusPieces,
  listPieces,
  loadState,
  saveCorpusPiece,
  savePiece,
  saveState,
} from './library';
import type { SavedCorpusPiece, SavedPiece } from './library';

/**
 * El "cerebro" (spec §5): todo lo aprendido en un JSON descargable —
 * tu gusto (pesos), las piezas compuestas y el corpus importado. Se puede
 * llevar a otra máquina o guardar de recuerdo.
 */

export type Brain = {
  app: 'manos-torpes';
  version: 1;
  exportedAt: number;
  taste: Taste;
  pieces: SavedPiece[];
  corpus: SavedCorpusPiece[];
};

const TASTE_KEY = 'gusto';

export async function loadTaste(): Promise<Taste> {
  const stored = await loadState<Taste>(TASTE_KEY);
  return stored ?? defaultTaste();
}

export function saveTaste(taste: Taste): Promise<void> {
  return saveState(TASTE_KEY, taste);
}

export async function exportBrain(): Promise<Brain> {
  const [taste, pieces, corpus] = await Promise.all([
    loadTaste(),
    listPieces(),
    listCorpusPieces(),
  ]);
  return { app: 'manos-torpes', version: 1, exportedAt: Date.now(), taste, pieces, corpus };
}

/** Restaura un cerebro exportado. Suma piezas/corpus; el gusto se reemplaza. */
export async function importBrain(raw: unknown): Promise<{ pieces: number; corpus: number }> {
  const brain = raw as Partial<Brain>;
  if (brain?.app !== 'manos-torpes' || brain.version !== 1) {
    throw new Error('esto no parece un cerebro de Manos Torpes (v1)');
  }
  if (
    !brain.taste ||
    typeof brain.taste.ratings !== 'number' ||
    WEIGHT_KEYS.some((k) => typeof brain.taste?.weights?.[k] !== 'number')
  ) {
    throw new Error('el gusto del cerebro viene incompleto');
  }
  await saveTaste(brain.taste);
  let pieces = 0;
  for (const piece of brain.pieces ?? []) {
    const { id: _id, ...rest } = piece;
    await savePiece(rest);
    pieces++;
  }
  let corpus = 0;
  for (const piece of brain.corpus ?? []) {
    const { id: _id, ...rest } = piece;
    await saveCorpusPiece(rest);
    corpus++;
  }
  return { pieces, corpus };
}
