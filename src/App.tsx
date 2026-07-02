import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import { playGenome, stopPlayback } from './audio/player';
import type { StepHighlight } from './audio/player';
import { CorpusPanel } from './components/CorpusPanel';
import { GenerationTimeline } from './components/GenerationTimeline';
import { KeyboardCanvas } from './components/KeyboardCanvas';
import { LibraryPanel } from './components/LibraryPanel';
import { RewardPanel } from './components/RewardPanel';
import { TrainerControls } from './components/TrainerControls';
import { decodeAudioToMono22050, estimateBpm, transcribeAudio } from './corpus/audio-import';
import { importFromNotes, parseMidiBuffer } from './corpus/midi-import';
import { MarkovModel } from './engine/markov';
import { usePiano } from './hooks/usePiano';
import { useTrainer } from './hooks/useTrainer';
import type { Snapshot } from './hooks/useTrainer';
import {
  deleteCorpusPiece,
  deletePiece,
  listCorpusPieces,
  listPieces,
  saveCorpusPiece,
  savePiece,
} from './storage/library';
import type { SavedCorpusPiece, SavedPiece } from './storage/library';
import type { Genome } from './types/music';

/** Peso de la similitud al corpus en la recompensa mezclada (Etapa 2). */
const CORPUS_ALPHA = 0.35;

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
  const [corpusPieces, setCorpusPieces] = useState<SavedCorpusPiece[]>([]);
  const [learnFromCorpus, setLearnFromCorpus] = useState(true);
  const [corpusBusy, setCorpusBusy] = useState<string | null>(null);
  const [corpusProgress, setCorpusProgress] = useState<number | null>(null);
  const [corpusError, setCorpusError] = useState<string | null>(null);

  const refreshLibrary = useCallback(() => {
    listPieces()
      .then(setPieces)
      .catch((err) => console.error('No se pudo leer la biblioteca:', err));
    listCorpusPieces()
      .then(setCorpusPieces)
      .catch((err) => console.error('No se pudo leer el corpus:', err));
  }, []);

  useEffect(refreshLibrary, [refreshLibrary]);

  // Modelo de la Etapa 2: se re-entrena (rápido, son conteos) al cambiar el corpus.
  const corpusModel = useMemo(() => {
    const seqs = corpusPieces.flatMap((p) => p.melodySeqs);
    if (seqs.length === 0) return null;
    const model = new MarkovModel(3);
    model.train(seqs);
    return model;
  }, [corpusPieces]);

  const handleCorpusFiles = useCallback(
    async (files: File[]) => {
      const MIDI_EXT = /\.(mid|midi)$/i;
      const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|flac)$/i;
      setCorpusError(null);
      for (const file of files) {
        setCorpusBusy(file.name);
        setCorpusProgress(null);
        try {
          let piece;
          if (MIDI_EXT.test(file.name)) {
            piece = parseMidiBuffer(file.name, await file.arrayBuffer(), bars);
          } else if (AUDIO_EXT.test(file.name)) {
            // Camino experimental: decodificar aquí, transcribir en el worker.
            const audio = await decodeAudioToMono22050(file);
            const notes = await transcribeAudio(audio, (pct) =>
              setCorpusProgress(Math.round(pct * 100)),
            );
            if (notes.length === 0) throw new Error('la transcripción no encontró notas');
            piece = importFromNotes(file.name, notes, estimateBpm(notes), bars, 'audio');
          } else {
            setCorpusError(`«${file.name}»: formato no soportado (usa .mid, .mp3 o .wav).`);
            continue;
          }
          if (piece.windows.length === 0) {
            setCorpusError(
              `«${file.name}»: sin fragmentos aprovechables tras el filtro físico (¿muy corta o muy dispersa?).`,
            );
            continue;
          }
          await saveCorpusPiece({
            name: piece.name,
            addedAt: Date.now(),
            source: piece.source,
            noteCount: piece.noteCount,
            windows: piece.windows,
            melodySeqs: piece.melodySeqs,
          });
        } catch (err) {
          console.error(`No se pudo importar «${file.name}»:`, err);
          setCorpusError(`«${file.name}»: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setCorpusBusy(null);
          setCorpusProgress(null);
        }
      }
      refreshLibrary();
    },
    [bars, refreshLibrary],
  );

  const handleCorpusDelete = useCallback(
    (id: number) => {
      deleteCorpusPiece(id)
        .then(refreshLibrary)
        .catch((err) => console.error('No se pudo borrar del corpus:', err));
    },
    [refreshLibrary],
  );

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
    const seeds: Genome[] = [];
    if (warmStart && pieces.length > 0) {
      seeds.push(
        ...[...pieces]
          .filter((p) => p.genome.bars === bars)
          .sort((a, b) => b.reward - a.reward)
          .slice(0, 8)
          .map((p) => p.genome),
      );
    }
    // Etapa 2: fragmentos de música real también siembran la población.
    if (learnFromCorpus && corpusModel) {
      const windows = corpusPieces.flatMap((p) => p.windows).filter((w) => w.bars === bars);
      seeds.push(...windows.slice(0, 8));
    }
    trainer.start({
      bars,
      tempo,
      seedGenomes: seeds.length > 0 ? seeds : undefined,
      corpus:
        learnFromCorpus && corpusModel
          ? { model: corpusModel.toJSON(), alpha: CORPUS_ALPHA }
          : undefined,
    });
    trainer.setThrottle(speed >= 50 ? null : speed * 2);
  }, [trainer, bars, tempo, speed, warmStart, pieces, learnFromCorpus, corpusModel, corpusPieces]);

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

      <CorpusPanel
        pieces={corpusPieces}
        busy={corpusBusy}
        progress={corpusProgress}
        error={corpusError}
        learnFromCorpus={learnFromCorpus}
        trainerRunning={trainer.state !== 'sin-iniciar'}
        onFiles={(files) => void handleCorpusFiles(files)}
        onDelete={handleCorpusDelete}
        onLearnChange={setLearnFromCorpus}
      />

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
          {learnFromCorpus && corpusModel
            ? 'Etapa 2 «Estudiante»: aprende de tu música y de la heurística a la vez.'
            : 'Etapa 1 «Bebé»: algoritmo genético con manos físicamente humanas.'}{' '}
          Colores: mano izquierda <span className="dot left" /> · mano derecha{' '}
          <span className="dot right" /> · números = dedos (1 pulgar … 5 meñique).
        </p>
      </footer>
    </div>
  );
}

export default App;
