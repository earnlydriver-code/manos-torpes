import type { SavedPiece } from '../storage/library';

/**
 * Biblioteca de piezas (idea del Usuario): lo aprendido queda guardado entre
 * sesiones, se puede escuchar, borrar, y siembra nuevas corridas.
 */

type Props = {
  pieces: SavedPiece[];
  playingId: number | null;
  canPlay: boolean;
  onPlay: (piece: SavedPiece) => void;
  onStop: () => void;
  onDelete: (id: number) => void;
};

export function LibraryPanel({ pieces, playingId, canPlay, onPlay, onStop, onDelete }: Props) {
  if (pieces.length === 0) return null;
  return (
    <div className="library">
      <div className="library-header">
        <h2>Piezas guardadas</h2>
        <span className="library-info">
          {pieces.length} pieza{pieces.length === 1 ? '' : 's'} — siembran el próximo
          entrenamiento si activas «Partir de lo aprendido»
        </span>
      </div>
      <ul>
        {[...pieces]
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((piece) => (
            <li key={piece.id}>
              <span className="piece-name">{piece.name}</span>
              <span className="piece-meta">
                {piece.genome.bars} compases · gen {piece.gen} · {piece.reward.toFixed(3)}
              </span>
              {playingId === piece.id ? (
                <button onClick={onStop}>⏹</button>
              ) : (
                <button disabled={!canPlay} onClick={() => onPlay(piece)}>
                  ▶
                </button>
              )}
              <button
                className="danger"
                title="Borrar pieza"
                onClick={() => piece.id !== undefined && onDelete(piece.id)}
              >
                🗑
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
