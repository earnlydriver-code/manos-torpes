import { useCallback, useEffect, useState } from 'react';
import './App.css';
import { playGenome, stopPlayback } from './audio/player';
import type { StepHighlight } from './audio/player';
import { GenerationTimeline } from './components/GenerationTimeline';
import { KeyboardCanvas } from './components/KeyboardCanvas';
import { LibraryPanel } from './components/LibraryPanel';
import { RewardPanel } from './components/RewardPanel';
import { TrainerControls } from './components/TrainerControls';
import { usePiano } from './hooks/usePiano';
import { useTrainer } from './hooks/useTrainer';
import type { Snapshot } from './hooks/useTrainer';
import { deletePiece, listPieces, savePiece } from './storage/library';
import type { SavedPiece } from './storage/library';
import type { Genome } from './types/music';

/** Qué está sonando ahora mismo (una sola cosa a la vez). */
type PlayingSource =
  | { kind: 'best' }
  | { kind: 'snapshot'; gen: number }
  | { kind: 'piece'; id: number }
  | null;

function App() {
  const piano = usePiano();
  const trainer = useTrainer();
  const [highlights, setHighlights] = useState<StepHighlight[]>([]);
  const [playing, setPlaying] = useState<PlayingSource>(null);
  const [speed, setSpeed] = useState(50);
  const [tempo, setTempo] = useState(100);
  const [bars, setBars] = useState<2 | 3 | 4>(2);
  const [pieces, setPieces] = useState<SavedPiece[]>([]);
  const [warmStart, setWarmStart] = useState(true);

  const refreshLibrary = useCallback(() => {
    listPieces()
      .then(setPieces)
      .catch((err) => console.error('No se pudo leer la biblioteca:', err));
  }, []);

  useEffect(refreshLibrary, [refreshLibrary]);

  // Velocidad 1x–50x → generaciones/segundo del worker (50x = sin freno).
  const applySpeed = useCallback(
    (value: number) => {
      setSpeed(value);
      trainer.setThrottle(value >= 50 ? null : value * 2);
    },
    [trainer],
  );

  const handleStopPlayback = useCallback(() => {
    stopPlayback();
    setPlaying(null);
    setHighlights([]);
  }, []);

  const playPiece = useCallback(
    (genome: Genome, source: Exclude<PlayingSource, null>) => {
      const sampler = piano.samplerRef.current;
      if (!sampler) return;
      playGenome(genome, sampler, (_step, hl) => setHighlights(hl));
      setPlaying(source);
    },
    [piano.samplerRef],
  );

  const handleTrain = useCallback(() => {
    const seeds =
      warmStart && pieces.length > 0
        ? [...pieces]
            .filter((p) => p.genome.bars === bars)
            .sort((a, b) => b.reward - a.reward)
            .slice(0, 8)
            .map((p) => p.genome)
        : undefined;
    trainer.start({ bars, tempo, seedGenomes: seeds });
    trainer.setThrottle(speed >= 50 ? null : speed * 2);
  }, [trainer, bars, tempo, speed, warmStart, pieces]);

  const handleSave = useCallback(() => {
    if (!trainer.bestGenome || trainer.best === null) return;
    savePiece({
      name: `Pieza ${pieces.length + 1}`,
      createdAt: Date.now(),
      gen: trainer.gen,
      reward: trainer.best,
      genome: trainer.bestGenome,
    })
      .then(refreshLibrary)
      .catch((err) => console.error('No se pudo guardar la pieza:', err));
  }, [trainer.bestGenome, trainer.best, trainer.gen, pieces.length, refreshLibrary]);

  const handleDelete = useCallback(
    (id: number) => {
      if (playing?.kind === 'piece' && playing.id === id) handleStopPlayback();
      deletePiece(id)
        .then(refreshLibrary)
        .catch((err) => console.error('No se pudo borrar la pieza:', err));
    },
    [playing, handleStopPlayback, refreshLibrary],
  );

  const handleReset = useCallback(() => {
    handleStopPlayback();
    trainer.reset();
  }, [handleStopPlayback, trainer]);

  useEffect(() => stopPlayback, []); // limpiar el Transport al desmontar

  const audioReady = piano.state === 'listo';

  return (
    <div className="app">
      <header>
        <h1>Manos Torpes</h1>
        <p className="tagline">
          Una IA con dos manos de cinco dedos aprende piano desde cero — escucha cómo evoluciona.
        </p>
      </header>

      {piano.state !== 'listo' && (
        <div className="overlay">
          {piano.state === 'sin-activar' && (
            <button className="activate" onClick={() => void piano.activate()}>
              🎹 Activar sonido
            </button>
          )}
          {piano.state === 'cargando' && <p className="loading">Cargando piano real…</p>}
          {piano.state === 'error' && (
            <p className="loading">
              No se pudieron cargar los samples (¿sin internet?). Revisa la consola.
            </p>
          )}
        </div>
      )}

      <KeyboardCanvas
        highlights={highlights}
        handsActive={playing !== null}
        onNoteOn={piano.noteOn}
        onNoteOff={piano.noteOff}
      />

      <TrainerControls
        state={trainer.state}
        gen={trainer.gen}
        best={trainer.best}
        speed={speed}
        tempo={tempo}
        bars={bars}
        playing={playing !== null}
        canPlay={trainer.bestGenome !== null && audioReady}
        canSave={trainer.bestGenome !== null}
        warmStart={warmStart}
        warmCount={pieces.filter((p) => p.genome.bars === bars).length}
        onTrain={handleTrain}
        onPause={trainer.pause}
        onResume={trainer.resume}
        onReset={handleReset}
        onSpeed={applySpeed}
        onTempo={setTempo}
        onBars={setBars}
        onPlayBest={() =>
          trainer.bestGenome && playPiece(trainer.bestGenome, { kind: 'best' })
        }
        onStopPlayback={handleStopPlayback}
        onSave={handleSave}
        onWarmStart={setWarmStart}
      />

      <GenerationTimeline
        snapshots={trainer.snapshots}
        playingGen={playing?.kind === 'snapshot' ? playing.gen : null}
        canPlay={audioReady}
        onPlay={(s: Snapshot) => playPiece(s.genome, { kind: 'snapshot', gen: s.gen })}
        onStop={handleStopPlayback}
      />

      <RewardPanel history={trainer.history} breakdown={trainer.breakdown} />

      <LibraryPanel
        pieces={pieces}
        playingId={playing?.kind === 'piece' ? playing.id : null}
        canPlay={audioReady}
        onPlay={(p) => p.id !== undefined && playPiece(p.genome, { kind: 'piece', id: p.id })}
        onStop={handleStopPlayback}
        onDelete={handleDelete}
      />

      <footer>
        <p>
          Etapa 1 «Bebé»: algoritmo genético con manos físicamente humanas. Colores: mano
          izquierda <span className="dot left" /> · mano derecha <span className="dot right" /> ·
          números = dedos (1 pulgar … 5 meñique).
        </p>
      </footer>
    </div>
  );
}

export default App;
