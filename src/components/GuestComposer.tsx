import { useState } from 'react';
import type { GuestModel } from '../corpus/guest';

/**
 * Compositor invitado (mejora 4/4): una IA local (Ollama) propone frases;
 * el pipeline físico las adapta a manos humanas y quedan en la biblioteca
 * como semillas del próximo entrenamiento.
 */

type Props = {
  models: GuestModel[];
  selected: string | null;
  busy: boolean;
  message: string | null;
  onSelect: (model: string) => void;
  onCompose: (style: string) => void;
};

export function GuestComposer({ models, selected, busy, message, onSelect, onCompose }: Props) {
  const [style, setStyle] = useState('');

  if (models.length === 0) {
    return (
      <div className="guest">
        <div className="library-header">
          <h2>Compositora invitada (IA local)</h2>
          <span className="library-info">
            Ollama no responde en localhost:11434 — arráncalo y recarga para invitar a tus modelos
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="guest">
      <div className="library-header">
        <h2>Compositora invitada (IA local)</h2>
        <span className="library-info">
          propone una frase; nuestras manos la adaptan y siembra el próximo entrenamiento
        </span>
      </div>
      <div className="guest-row">
        <select value={selected ?? ''} disabled={busy} onChange={(e) => onSelect(e.target.value)}>
          {models.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} ({m.sizeGb.toFixed(1)} GB)
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="estilo (ej: triste y lento, épico, vals...)"
          value={style}
          disabled={busy}
          onChange={(e) => setStyle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) onCompose(style);
          }}
        />
        <button className="primary" disabled={busy || !selected} onClick={() => onCompose(style)}>
          {busy ? '🎼 Componiendo…' : '🎼 Invitar a componer'}
        </button>
      </div>
      {message && <p className="guest-message">{message}</p>}
    </div>
  );
}
