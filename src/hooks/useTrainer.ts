import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_WEIGHTS } from '../engine/constants';
import type { RewardBreakdown } from '../engine/reward-breakdown';
import type { Genome, RewardWeights, TrainConfig } from '../types/music';
import type { MainToWorker, WorkerToMain } from '../workers/protocol';

export type TrainerState = 'sin-iniciar' | 'entrenando' | 'pausado';
export type HistoryPoint = { gen: number; best: number; avg: number };
export type Snapshot = { gen: number; reward: number; genome: Genome };

const HISTORY_LIMIT = 4000;
const SNAPSHOT_LIMIT = 160; // ~8000 generaciones a 1 snapshot/50 gens

/**
 * Envuelve el trainer.worker: estado React + comandos. La UI nunca entrena.
 * Cada corrida lleva un runId; los mensajes de corridas viejas que quedaron
 * en vuelo tras un reset se descartan (hallazgo de la revisión adversarial).
 */
export function useTrainer() {
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const [state, setState] = useState<TrainerState>('sin-iniciar');
  const [gen, setGen] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [bestGenome, setBestGenome] = useState<Genome | null>(null);
  const [breakdown, setBreakdown] = useState<RewardBreakdown | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/trainer.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerToMain>) => {
      const msg = event.data;
      if ('runId' in msg && msg.runId !== runIdRef.current) return; // corrida descartada
      switch (msg.type) {
        case 'progress':
          setGen(msg.gen);
          setBest((prev) => (prev === null ? msg.best : Math.max(prev, msg.best)));
          setHistory((h) => {
            const next = [...h, { gen: msg.gen, best: msg.best, avg: msg.avg }];
            return next.length > HISTORY_LIMIT ? next.slice(-HISTORY_LIMIT + 500) : next;
          });
          break;
        case 'newBest':
          setBest(msg.reward);
          setBestGenome(msg.genome);
          setBreakdown(msg.breakdown);
          break;
        case 'snapshot':
          setSnapshots((prev) => {
            const next = [...prev, { gen: msg.gen, reward: msg.reward, genome: msg.genome }];
            // Si el timeline se llena, se ralea quitando uno de cada dos del
            // tramo viejo (se conserva siempre la generación 0).
            if (next.length <= SNAPSHOT_LIMIT) return next;
            return next.filter((_, i) => i === 0 || i % 2 === 1 || i >= next.length - 20);
          });
          break;
        case 'paused':
          setGen(msg.gen); // el gen real puede ir por delante del último progress
          break;
        case 'error':
          console.error('trainer.worker:', msg.message);
          break;
      }
    };
    return () => worker.terminate();
  }, []);

  const send = useCallback((msg: MainToWorker) => {
    workerRef.current?.postMessage(msg);
  }, []);

  const start = useCallback(
    (
      config: Pick<TrainConfig, 'bars' | 'tempo' | 'seedGenomes' | 'corpus'> & {
        weights?: RewardWeights;
      },
    ) => {
      const cfg: TrainConfig = {
        populationSize: 64,
        elitism: 6,
        tournamentK: 3,
        crossoverProb: 0.7,
        weights: DEFAULT_WEIGHTS,
        seed: (Math.random() * 2 ** 31) | 0,
        ...config,
      };
      runIdRef.current += 1;
      setHistory([]);
      setSnapshots([]);
      setGen(0);
      setBest(null);
      setBestGenome(null);
      setBreakdown(null);
      send({ type: 'init', config: cfg, runId: runIdRef.current });
      send({ type: 'start' });
      setState('entrenando');
    },
    [send],
  );

  const pause = useCallback(() => {
    send({ type: 'pause' });
    setState('pausado');
  }, [send]);

  const resume = useCallback(() => {
    send({ type: 'start' });
    setState('entrenando');
  }, [send]);

  const reset = useCallback(() => {
    runIdRef.current += 1; // invalida cualquier mensaje en vuelo de la corrida
    send({ type: 'stop' });
    setState('sin-iniciar');
    setGen(0);
    setBest(null);
    setBestGenome(null);
    setBreakdown(null);
    setHistory([]);
    setSnapshots([]);
  }, [send]);

  const setThrottle = useCallback(
    (genPerSecond: number | null) => send({ type: 'setThrottle', genPerSecond }),
    [send],
  );

  /** Etapa 3: el gusto cambia los pesos EN CALIENTE (re-evalúa la población). */
  const setWeights = useCallback(
    (weights: RewardWeights) => send({ type: 'setWeights', weights }),
    [send],
  );

  return {
    state,
    gen,
    best,
    bestGenome,
    breakdown,
    history,
    snapshots,
    start,
    pause,
    resume,
    reset,
    setThrottle,
    setWeights,
  };
}
