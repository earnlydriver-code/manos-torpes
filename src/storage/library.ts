import type { Genome } from '../types/music';

/**
 * Persistencia en IndexedDB (idea del Usuario: que lo aprendido quede en
 * memoria entre sesiones — y poder borrar lo viejo).
 *  - 'piezas': composiciones del agente (siembran el arranque en caliente).
 *  - 'corpus': música real importada (MIDI/audio) ya cuantizada y pasada por
 *    el filtro físico; entrena el modelo de la Etapa 2.
 */

export type SavedPiece = {
  id?: number;
  name: string;
  createdAt: number; // epoch ms
  gen: number;
  reward: number;
  genome: Genome;
};

export type SavedCorpusPiece = {
  id?: number;
  name: string;
  addedAt: number; // epoch ms
  source: 'midi' | 'audio';
  noteCount: number;
  windows: Genome[];
  melodySeqs: number[][];
  /** Tempo real del archivo. Piezas viejas no lo traen: se usa windows[0].tempo. */
  bpm?: number;
  /** Cortes por tamaño de frase. Piezas viejas no lo traen: solo sirven a 2 compases. */
  windowsByBars?: { 2: Genome[]; 3: Genome[]; 4: Genome[] };
};

const DB_NAME = 'manos-torpes';
const DB_VERSION = 3; // v2: + 'corpus' (Fase 4) · v3: + 'estado' (gusto, Fase 5)
const STORE_PIECES = 'piezas';
const STORE_CORPUS = 'corpus';
const STORE_STATE = 'estado';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const store of [STORE_PIECES, STORE_CORPUS]) {
        if (!req.result.objectStoreNames.contains(store)) {
          req.result.createObjectStore(store, { keyPath: 'id', autoIncrement: true });
        }
      }
      if (!req.result.objectStoreNames.contains(STORE_STATE)) {
        req.result.createObjectStore(STORE_STATE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = run(transaction.objectStore(storeName));
        // Se resuelve en oncomplete, no en request.onsuccess: el onsuccess llega
        // ANTES del commit, y una escritura puede abortar al confirmar (p. ej.
        // cuota llena) — resolver antes sería una pérdida silenciosa.
        let result: T;
        request.onsuccess = () => {
          result = request.result;
        };
        transaction.oncomplete = () => {
          db.close();
          resolve(result);
        };
        // 'complete' solo dispara en commit exitoso: sin cerrar también en
        // abort/error, cada fallo filtraría una conexión abierta.
        transaction.onabort = () => {
          db.close();
          reject(transaction.error ?? request.error ?? new Error('transacción abortada'));
        };
      }),
  );
}

export function savePiece(piece: Omit<SavedPiece, 'id'>): Promise<number> {
  return tx(STORE_PIECES, 'readwrite', (store) => store.add(piece) as IDBRequest<number>);
}

export function listPieces(): Promise<SavedPiece[]> {
  return tx(STORE_PIECES, 'readonly', (store) => store.getAll() as IDBRequest<SavedPiece[]>);
}

export function deletePiece(id: number): Promise<void> {
  return tx(STORE_PIECES, 'readwrite', (store) => store.delete(id)).then(() => undefined);
}

export function saveCorpusPiece(piece: Omit<SavedCorpusPiece, 'id'>): Promise<number> {
  return tx(STORE_CORPUS, 'readwrite', (store) => store.add(piece) as IDBRequest<number>);
}

export function listCorpusPieces(): Promise<SavedCorpusPiece[]> {
  return tx(STORE_CORPUS, 'readonly', (store) => store.getAll() as IDBRequest<SavedCorpusPiece[]>);
}

export function deleteCorpusPiece(id: number): Promise<void> {
  return tx(STORE_CORPUS, 'readwrite', (store) => store.delete(id)).then(() => undefined);
}

/** Estado pequeño clave-valor (el gusto de la Etapa 3, y lo que venga). */
export function saveState<T>(key: string, value: T): Promise<void> {
  return tx(STORE_STATE, 'readwrite', (store) => store.put({ key, value })).then(() => undefined);
}

export function loadState<T>(key: string): Promise<T | null> {
  return tx(
    STORE_STATE,
    'readonly',
    (store) => store.get(key) as IDBRequest<{ key: string; value: T } | undefined>,
  ).then((row) => (row ? row.value : null));
}
