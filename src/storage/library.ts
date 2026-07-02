import type { Genome } from '../types/music';

/**
 * Biblioteca de piezas en IndexedDB (idea del Usuario: que lo que el agente
 * aprende quede en memoria entre sesiones — y poder borrar lo viejo).
 * Las piezas guardadas también siembran nuevas corridas (arranque en caliente).
 */

export type SavedPiece = {
  id?: number;
  name: string;
  createdAt: number; // epoch ms
  gen: number;
  reward: number;
  genome: Genome;
};

const DB_NAME = 'manos-torpes';
const STORE = 'piezas';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
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
  return tx('readwrite', (store) => store.add(piece) as IDBRequest<number>);
}

export function listPieces(): Promise<SavedPiece[]> {
  return tx('readonly', (store) => store.getAll() as IDBRequest<SavedPiece[]>);
}

export function deletePiece(id: number): Promise<void> {
  return tx('readwrite', (store) => store.delete(id)).then(() => undefined);
}
