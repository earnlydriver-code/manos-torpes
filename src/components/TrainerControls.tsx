import { useEffect, useState } from 'react';
import type { TrainerState } from '../hooks/useTrainer';

/**
 * Controles de entrenamiento y reproducción. La velocidad (1x–50x) regula
 * cuántas generaciones/segundo corre el worker — se entrena en silencio y
 * suena solo el mejor individuo cuando lo pides (spec §6).
 */

type Props = {
  state: TrainerState;
  gen: number;
  best: number | null;
  speed: number;
  tempo: number;
  bars: 2 | 3 | 4;
  playing: boolean;
  canPlay: boolean;
  canSave: boolean;
  warmStart: boolean;
  warmCount: number;
  onTrain: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onSpeed: (speed: number) => void;
  onTempo: (tempo: number) => void;
  onBars: (bars: 2 | 3 | 4) => void;
  onPlayBest: () => void;
  onStopPlayback: () => void;
  onSave: () => void;
  onWarmStart: (value: boolean) => void;
};

export function TrainerControls(props: Props) {
  const [tempoText, setTempoText] = useState(String(props.tempo));
  useEffect(() => setTempoText(String(props.tempo)), [props.tempo]);
  const {
    state,
    gen,
    best,
    speed,
    bars,
    playing,
    canPlay,
    canSave,
    warmStart,
    warmCount,
    onTrain,
    onPause,
    onResume,
    onReset,
    onSpeed,
    onTempo,
    onBars,
    onPlayBest,
    onStopPlayback,
    onSave,
    onWarmStart,
  } = props;

  return (
    <div className="controls">
      <div className="controls-row">
        {state === 'sin-iniciar' && (
          <button className="primary" onClick={onTrain}>
            ▶ Entrenar
          </button>
        )}
        {state === 'entrenando' && <button onClick={onPause}>⏸ Pausar</button>}
        {state === 'pausado' && (
          <button className="primary" onClick={onResume}>
            ▶ Continuar
          </button>
        )}
        {state !== 'sin-iniciar' && <button onClick={onReset}>↺ Reset</button>}

        <span className="divider" />

        {playing ? (
          <button onClick={onStopPlayback}>⏹ Detener</button>
        ) : (
          <button className="primary" disabled={!canPlay} onClick={onPlayBest}>
            🎹 Reproducir mejor
          </button>
        )}
        <button disabled={!canSave} onClick={onSave} title="Guarda el mejor en la biblioteca">
          💾 Guardar pieza
        </button>

        <span className="divider" />

        <span className="stat">
          Generación <strong>{gen}</strong>
        </span>
        <span className="stat">
          Mejor <strong>{best === null ? '—' : best.toFixed(3)}</strong>
        </span>
      </div>

      <div className="controls-row secondary">
        <label>
          Velocidad {speed}x
          <input
            type="range"
            min={1}
            max={50}
            value={speed}
            onChange={(e) => onSpeed(Number(e.target.value))}
          />
        </label>
        <label>
          Tempo
          <input
            type="number"
            min={60}
            max={140}
            value={tempoText}
            disabled={state !== 'sin-iniciar'}
            onChange={(e) => setTempoText(e.target.value)}
            onBlur={() => {
              // Clampar en cada tecla hace imposible escribir "85" (el "8" se
              // convertía en 60): se deja teclear libre y se valida al salir.
              const clamped = Math.max(60, Math.min(140, Number(tempoText) || 100));
              setTempoText(String(clamped));
              onTempo(clamped);
            }}
          />
        </label>
        <label>
          Compases
          <select
            value={bars}
            disabled={state !== 'sin-iniciar'}
            onChange={(e) => onBars(Number(e.target.value) as 2 | 3 | 4)}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        {warmCount > 0 && (
          <label title="Siembra la población inicial con tus piezas guardadas: no empieza de cero">
            <input
              type="checkbox"
              checked={warmStart}
              disabled={state !== 'sin-iniciar'}
              onChange={(e) => onWarmStart(e.target.checked)}
            />
            Partir de lo aprendido ({warmCount})
          </label>
        )}
      </div>
    </div>
  );
}
