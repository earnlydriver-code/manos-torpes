import { useRef } from 'react';
import type { Taste } from '../engine/taste';
import { WEIGHT_KEYS } from '../engine/taste';

/**
 * Etapa 3 «Tu alumno» (spec §6.6): califica lo que suena y el agente converge
 * hacia tu gusto — cada 👍/👎 ajusta los pesos de la recompensa. Incluye el
 * cerebro exportable (spec §5).
 */

const LABELS: Record<string, string> = {
  consonance: 'Consonancia',
  rhythm: 'Ritmo',
  structure: 'Estructura',
  contour: 'Contorno',
  physics: 'Física',
  entropy: 'Variedad',
};

type Props = {
  taste: Taste;
  canRate: boolean; // hay algo sonando
  onRate: (rating: 1 | -1) => void;
  onReset: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  message: string | null;
};

export function TastePanel({ taste, canRate, onRate, onReset, onExport, onImport, message }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isDefault = taste.ratings === 0;

  return (
    <div className="taste">
      <div className="library-header">
        <h2>Tu gusto</h2>
        <span className="library-info">
          {isDefault
            ? 'Califica mientras suena y el agente aprenderá lo que te gusta'
            : `${taste.ratings} calificación${taste.ratings === 1 ? '' : 'es'} — el próximo entrenamiento usa estos pesos`}
        </span>
      </div>

      <div className="taste-row">
        <button
          className="rate like"
          disabled={!canRate}
          title={canRate ? 'Me gusta lo que suena' : 'Reproduce algo para calificarlo'}
          onClick={() => onRate(1)}
        >
          👍 Me gusta
        </button>
        <button
          className="rate dislike"
          disabled={!canRate}
          title={canRate ? 'No me gusta lo que suena' : 'Reproduce algo para calificarlo'}
          onClick={() => onRate(-1)}
        >
          👎 No me gusta
        </button>

        <span className="divider" />

        <button onClick={onExport} title="Descarga todo lo aprendido (gusto + piezas + corpus) a un JSON">
          ⬇ Descargar cerebro
        </button>
        <button onClick={() => fileRef.current?.click()} title="Restaura un cerebro descargado">
          ⬆ Cargar cerebro
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = '';
          }}
        />
        {!isDefault && (
          <button onClick={onReset} title="Vuelve a los pesos de fábrica de la spec">
            ↺ Olvidar mi gusto
          </button>
        )}
      </div>

      {message && <p className="taste-message">{message}</p>}

      <div className="taste-weights">
        {WEIGHT_KEYS.map((k) => (
          <div key={k} className="taste-weight" title={`${LABELS[k]}: ${(taste.weights[k] * 100).toFixed(0)}% de la recompensa`}>
            <span className="taste-label">{LABELS[k]}</span>
            <span className="taste-bar">
              <span className="taste-fill" style={{ width: `${Math.min(100, taste.weights[k] * 200)}%` }} />
            </span>
            <span className="taste-pct">{(taste.weights[k] * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
