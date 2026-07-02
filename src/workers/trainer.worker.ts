/// <reference lib="webworker" />
import { GeneticTrainer } from '../engine/genetic';
import type { GenStats } from '../engine/genetic';
import { rewardBreakdown } from '../engine/reward-breakdown';
import type { MainToWorker, WorkerToMain } from './protocol';

/**
 * Loop de entrenamiento en Web Worker: la UI nunca se congela. Dos reglas
 * vitales (ambas salieron de la revisión adversarial):
 *  1. El loop CEDE el hilo entre tandas — un while(true) jamás vería
 *     'pause'/'stop' (los workers son single-threaded).
 *  2. Con throttle, las tandas son PEQUEÑAS y el sueño se trocea en ≤100 ms
 *     re-chequeando running/velocidad: nada de dormir 12 s de un tirón con
 *     comandos del usuario esperando en la cola.
 */

const post = (msg: WorkerToMain): void =>
  (self as unknown as { postMessage(m: WorkerToMain): void }).postMessage(msg);

const FAST_CHUNK = 25; // generaciones por tanda a toda velocidad
const PROGRESS_EVERY_MS = 100;
const SNAPSHOT_EVERY_GENS = 50; // instantánea del mejor para el timeline (spec §6.2)

let trainer: GeneticTrainer | null = null;
let runId = 0;
let running = false;
let loopActive = false;
let bestSoFar = -Infinity;
let genPerSecond: number | null = null;
let lastProgressAt = 0;

function chunkSize(): number {
  if (genPerSecond === null) return FAST_CHUNK;
  return Math.max(1, Math.round(genPerSecond / 10)); // ~10 tandas/segundo
}

function announceBest(gen: number): void {
  if (!trainer) return;
  const { genome, fitness } = trainer.getBest();
  if (fitness > bestSoFar + 1e-9) {
    bestSoFar = fitness;
    post({
      type: 'newBest',
      runId,
      gen,
      reward: fitness,
      genome,
      breakdown: rewardBreakdown(genome.steps),
    });
  }
}

function postSnapshot(gen: number): void {
  if (!trainer) return;
  const { genome, fitness } = trainer.getBest();
  post({
    type: 'snapshot',
    runId,
    gen,
    reward: fitness,
    genome,
    breakdown: rewardBreakdown(genome.steps),
  });
}

function postProgress(stats: GenStats, force = false): void {
  const now = performance.now();
  if (!force && now - lastProgressAt < PROGRESS_EVERY_MS) return;
  lastProgressAt = now;
  post({ type: 'progress', runId, gen: stats.gen, best: stats.best, avg: stats.avg });
}

async function loop(): Promise<void> {
  if (loopActive) return;
  loopActive = true;
  try {
    while (running && trainer) {
      const myRun = runId;
      const pace = genPerSecond;
      const n = chunkSize();
      const chunkStart = performance.now();
      let stats: GenStats | null = null;
      for (let i = 0; i < n && running; i++) {
        stats = trainer.stepGeneration();
        if (stats.best > bestSoFar + 1e-9) announceBest(stats.gen);
        if (stats.gen % SNAPSHOT_EVERY_GENS === 0) postSnapshot(stats.gen);
      }
      if (stats) postProgress(stats);
      if (runId !== myRun) continue; // nueva corrida: no arrastrar el sueño pendiente
      if (pace !== null) {
        const target = chunkStart + (n / pace) * 1000;
        // Sueño interrumpible: en rebanadas de ≤100 ms, saliendo en cuanto
        // cambie la velocidad, llegue un stop/pause o arranque otra corrida.
        while (
          running &&
          runId === myRun &&
          genPerSecond === pace &&
          performance.now() < target
        ) {
          const remaining = target - performance.now();
          await new Promise((r) => setTimeout(r, Math.min(100, Math.max(0, remaining))));
        }
      } else {
        await new Promise((r) => setTimeout(r, 0)); // ceder el hilo
      }
    }
  } finally {
    loopActive = false;
  }
}

self.onmessage = (event: MessageEvent<MainToWorker>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'init': {
      runId = msg.runId;
      trainer = new GeneticTrainer(msg.config);
      running = false;
      bestSoFar = -Infinity;
      const stats = trainer.stats();
      postProgress(stats, true);
      announceBest(stats.gen); // el mejor aleatorio inicial, para poder escucharlo ya
      postSnapshot(stats.gen); // generación 0: el punto de partida del timeline
      break;
    }
    case 'start':
      if (!trainer) {
        post({ type: 'error', message: 'start sin init previo' });
        return;
      }
      if (!running) {
        running = true;
        void loop();
      }
      break;
    case 'pause':
      running = false;
      if (trainer) {
        postProgress(trainer.stats(), true);
        post({ type: 'paused', runId, gen: trainer.stats().gen });
      }
      break;
    case 'stop':
      running = false;
      trainer = null;
      post({ type: 'stopped' });
      break;
    case 'setThrottle':
      genPerSecond = msg.genPerSecond;
      break;
    case 'setWeights':
      trainer?.setWeights(msg.weights);
      break;
    case 'requestSnapshot':
      if (trainer) postSnapshot(trainer.stats().gen);
      break;
  }
};

post({ type: 'ready' });
