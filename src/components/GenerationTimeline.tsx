import { useEffect, useState } from 'react';
import type { Snapshot } from '../hooks/useTrainer';

/**
 * Timeline de generaciones (spec §6.2): viaja en el tiempo y escucha cómo
 * sonaba el agente en la generación 0 vs ahora. El worker guarda una
 * instantánea del mejor cada 50 generaciones.
 */

type Props = {
  snapshots: Snapshot[];
  playingGen: number | null; // gen del snapshot sonando, o null
  canPlay: boolean;
  onPlay: (snapshot: Snapshot) => void;
  onStop: () => void;
};

export function GenerationTimeline({ snapshots, playingGen, canPlay, onPlay, onStop }: Props) {
  const [index, setIndex] = useState(0);
  const [follow, setFollow] = useState(true); // seguir al último snapshot

  useEffect(() => {
    if (follow && snapshots.length > 0) setIndex(snapshots.length - 1);
  }, [snapshots, follow]);

  if (snapshots.length < 2) return null;
  const selected = snapshots[Math.min(index, snapshots.length - 1)];
  const isPlayingThis = playingGen !== null && playingGen === selected.gen;

  return (
    <div className="timeline">
      <div className="timeline-header">
        <h2>Máquina del tiempo</h2>
        <span className="timeline-info">
          Generación <strong>{selected.gen}</strong> · recompensa{' '}
          <strong>{selected.reward.toFixed(3)}</strong>
        </span>
      </div>
      <div className="timeline-row">
        <input
          type="range"
          min={0}
          max={snapshots.length - 1}
          value={Math.min(index, snapshots.length - 1)}
          onChange={(e) => {
            setIndex(Number(e.target.value));
            setFollow(Number(e.target.value) === snapshots.length - 1);
          }}
        />
        {isPlayingThis ? (
          <button onClick={onStop}>⏹</button>
        ) : (
          <button disabled={!canPlay} onClick={() => onPlay(selected)}>
            ▶ Escuchar
          </button>
        )}
      </div>
      <div className="timeline-ends">
        <span>gen {snapshots[0].gen}</span>
        <span>gen {snapshots[snapshots.length - 1].gen}</span>
      </div>
    </div>
  );
}
