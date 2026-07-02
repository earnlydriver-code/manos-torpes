import * as Tone from 'tone';

/**
 * Sampler del Salamander Grand (un Yamaha C5 real grabado nota a nota).
 * Un sample cada tercera menor: Tone.Sampler interpola el resto por pitch-shift.
 * CDN oficial de Tone.js por defecto; espejo local con VITE_SAMPLES_BASE.
 */

const BASE =
  (import.meta.env.VITE_SAMPLES_BASE as string | undefined) ??
  'https://tonejs.github.io/audio/salamander/';

function sampleUrls(): Record<string, string> {
  const urls: Record<string, string> = {};
  for (let octave = 2; octave <= 6; octave++) {
    urls[`C${octave}`] = `C${octave}.mp3`;
    urls[`D#${octave}`] = `Ds${octave}.mp3`;
    urls[`F#${octave}`] = `Fs${octave}.mp3`;
    urls[`A${octave}`] = `A${octave}.mp3`;
  }
  urls.C7 = 'C7.mp3';
  return urls;
}

/**
 * Arranca el AudioContext (requiere gesto del usuario: autoplay policy) y
 * carga el sampler. Idempotente.
 */
let sampler: Tone.Sampler | null = null;

export async function initPiano(): Promise<Tone.Sampler> {
  await Tone.start();
  if (sampler) return sampler;
  sampler = new Tone.Sampler({ urls: sampleUrls(), baseUrl: BASE, release: 1 }).toDestination();
  await Tone.loaded();
  return sampler;
}

export function midiToNote(midi: number): string {
  return Tone.Frequency(midi, 'midi').toNote();
}
