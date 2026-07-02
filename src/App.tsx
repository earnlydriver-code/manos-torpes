import { useCallback, useEffect, useState } from 'react';
import './App.css';
import { playGenome, stopPlayback } from './audio/player';
import type { StepHighlight } from './audio/player';
import { KeyboardCanvas } from './components/KeyboardCanvas';
import { RewardSparkline } from './components/RewardSparkline';
import { TrainerControls } from './components/TrainerControls';
import { usePiano } from './hooks/usePiano';
import { useTrainer } from './hooks/useTrainer';

function App() {
  const piano = usePiano();
  const trainer = useTrainer();
  const [highlights, setHighlights] = useState<StepHighlight[]>([]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(50);
  const [tempo, setTempo] = useState(100);
  const [bars, setBars] = useState<2 | 3 | 4>(2);

  // Velocidad 1x–50x → generaciones/segundo del worker (50x = sin freno).
  const applySpeed = useCallback(
    (value: number) => {
      setSpeed(value);
      trainer.setThrottle(value >= 50 ? null : value * 2);
    },
    [trainer],
  );

  const handleTrain = useCallback(() => {
    trainer.start({ bars, tempo });
    trainer.setThrottle(speed >= 50 ? null : speed * 2);
  }, [trainer, bars, tempo, speed]);

  const handlePlayBest = useCallback(() => {
    const sampler = piano.samplerRef.current;
    if (!sampler || !trainer.bestGenome) return;
    playGenome(trainer.bestGenome, sampler, (_step, hl) => setHighlights(hl));
    setPlaying(true);
  }, [piano.samplerRef, trainer.bestGenome]);

  const handleStopPlayback = useCallback(() => {
    stopPlayback();
    setPlaying(false);
    setHighlights([]);
  }, []);

  const handleReset = useCallback(() => {
    handleStopPlayback();
    trainer.reset();
  }, [handleStopPlayback, trainer]);

  useEffect(() => stopPlayback, []); // limpiar el Transport al desmontar

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

      <KeyboardCanvas highlights={highlights} onNoteOn={piano.noteOn} onNoteOff={piano.noteOff} />

      <TrainerControls
        state={trainer.state}
        gen={trainer.gen}
        best={trainer.best}
        speed={speed}
        tempo={tempo}
        bars={bars}
        playing={playing}
        canPlay={trainer.bestGenome !== null && piano.state === 'listo'}
        onTrain={handleTrain}
        onPause={trainer.pause}
        onResume={trainer.resume}
        onReset={handleReset}
        onSpeed={applySpeed}
        onTempo={setTempo}
        onBars={setBars}
        onPlayBest={handlePlayBest}
        onStopPlayback={handleStopPlayback}
      />

      <RewardSparkline history={trainer.history} />

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
