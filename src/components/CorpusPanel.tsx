import { useCallback, useState } from 'react';
import type { SavedCorpusPiece } from '../storage/library';

/**
 * Zona de corpus (spec §6.5): arrastra archivos MIDI y el agente aprende de
 * música real (Etapa 2 «Estudiante»). El audio (MP3/WAV) llega como
 * experimento aparte — la spec avisa que la transcripción es aproximada.
 */

type Props = {
  pieces: SavedCorpusPiece[];
  busy: string | null; // nombre del archivo procesándose, o null
  progress: number | null; // % de transcripción de audio, o null
  error: string | null;
  lstmStatus: 'sin-corpus' | 'entrenando' | 'lista' | 'respaldo';
  learnFromCorpus: boolean;
  trainerRunning: boolean;
  onFiles: (files: File[]) => void;
  onDelete: (id: number) => void;
  onLearnChange: (value: boolean) => void;
};

const LSTM_LABEL: Record<Props['lstmStatus'], string | null> = {
  'sin-corpus': null,
  entrenando: '🧠 Aprendiendo frases largas (LSTM)…',
  lista: '🧠 Frases largas: LSTM lista',
  respaldo: '🧠 Corpus pequeño: compone el modelo simple',
};

export function CorpusPanel({
  pieces,
  busy,
  progress,
  error,
  lstmStatus,
  learnFromCorpus,
  trainerRunning,
  onFiles,
  onDelete,
  onLearnChange,
}: Props) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      onFiles([...e.dataTransfer.files]);
    },
    [onFiles],
  );

  const totalWindows = pieces.reduce((acc, p) => acc + p.windows.length, 0);

  return (
    <div className="corpus">
      <div className="library-header">
        <h2>Aprender de música real</h2>
        {pieces.length > 0 && (
          <span className="library-info">
            {pieces.length} pieza{pieces.length === 1 ? '' : 's'} · {totalWindows} fragmentos
            aprendibles
          </span>
        )}
      </div>

      <div
        className={`dropzone${dragOver ? ' drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {busy ? (
          <p>
            Procesando «{busy}»{progress !== null ? ` — transcribiendo ${progress}%` : ''}…
          </p>
        ) : (
          <>
            <p>
              Arrastra archivos <strong>MIDI</strong> (.mid) o audio (.mp3/.wav) aquí
            </p>
            <label className="file-button">
              o elegir archivos
              <input
                type="file"
                accept=".mid,.midi,.mp3,.wav,.ogg,.m4a,.flac"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) onFiles([...e.target.files]);
                  e.target.value = '';
                }}
              />
            </label>
            <p className="corpus-hint">
              MIDI es el camino fiel. La transcripción de audio es aproximada y lenta: mejor
              piano solo, grabación limpia y clips cortos.
            </p>
          </>
        )}
      </div>

      {error && <p className="corpus-error">{error}</p>}
      {LSTM_LABEL[lstmStatus] && <p className="corpus-hint">{LSTM_LABEL[lstmStatus]}</p>}

      {pieces.length > 0 && (
        <>
          <label className="learn-toggle" title="Mezcla la recompensa con la similitud al corpus y activa el mutador de frases aprendidas">
            <input
              type="checkbox"
              checked={learnFromCorpus}
              disabled={trainerRunning}
              onChange={(e) => onLearnChange(e.target.checked)}
            />
            Aprender del corpus en el próximo entrenamiento (Etapa 2 «Estudiante»)
          </label>
          <ul>
            {[...pieces]
              .sort((a, b) => b.addedAt - a.addedAt)
              .map((piece) => (
                <li key={piece.id}>
                  <span className="piece-name">{piece.name}</span>
                  <span className="piece-meta">
                    {piece.source === 'midi' ? 'MIDI' : 'audio'} ·{' '}
                    {piece.bpm ?? piece.windows[0]?.tempo ?? '¿?'} BPM · {piece.noteCount} notas ·{' '}
                    {piece.windows.length} fragmentos
                  </span>
                  <button
                    className="danger"
                    title="Quitar del corpus"
                    onClick={() => piece.id !== undefined && onDelete(piece.id)}
                  >
                    🗑
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
