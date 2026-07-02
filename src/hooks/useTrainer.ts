import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_WEIGHTS } from '../engine/constants';
import type { Genome, TrainConfig } from '../types/music';
import type { MainToWorker, WorkerToMain } from '../workers/protocol';

export type TrainerState = 'sin-iniciar' | 'entrenando' | 'pausado';
export type HistoryPoint = { gen: number; best: number; avg: number };

const HISTORY_LIMIT = 4000;

/** Envuelve el trainer.worker: estado React + comandos. La UI nunca entrena. */
export function useTrainer() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<TrainerState>('sin-iniciar');
  const [gen, setGen] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [bestGenome, setBestGenome] = useState<Genome | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/trainer.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerToMain>) => {
      const msg = event.data;
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
    (config: Pick<TrainConfig, 'bars' | 'tempo'>) => {
      const cfg: TrainConfig = {
        populationSize: 64,
        elitism: 6,
        tournamentK: 3,
        crossoverProb: 0.7,
        weights: DEFAULT_WEIGHTS,
        seed: (Math.random() * 2 ** 31) | 0,
        ...config,
      };
      setHistory([]);
      setGen(0);
      setBest(null);
      setBestGenome(null);
      send({ type: 'init', config: cfg });
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
    send({ type: 'stop' });
    setState('sin-iniciar');
    setGen(0);
    setBest(null);
    setBestGenome(null);
    setHistory([]);
  }, [send]);

  const setThrottle = useCallback(
    (genPerSecond: number | null) => send({ type: 'setThrottle', genPerSecond }),
    [send],
  );

  return { state, gen, best, bestGenome, history, start, pause, resume, reset, setThrottle };
}
