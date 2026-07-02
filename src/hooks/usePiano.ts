import { useCallback, useRef, useState } from 'react';
import type * as Tone from 'tone';
import { initPiano, midiToNote } from '../audio/piano';

export type PianoState = 'sin-activar' | 'cargando' | 'listo' | 'error';

/**
 * Carga del sampler tras el gesto del usuario (autoplay policy) y noteOn/off
 * para el teclado clickeable.
 */
export function usePiano() {
  const [state, setState] = useState<PianoState>('sin-activar');
  const samplerRef = useRef<Tone.Sampler | null>(null);

  const activate = useCallback(async () => {
    if (samplerRef.current) return;
    setState('cargando');
    try {
      samplerRef.current = await initPiano();
      setState('listo');
    } catch (error) {
      console.error('No se pudo cargar el piano:', error);
      setState('error');
    }
  }, []);

  const noteOn = useCallback((midi: number) => {
    samplerRef.current?.triggerAttack(midiToNote(midi), undefined, 0.8);
  }, []);

  const noteOff = useCallback((midi: number) => {
    samplerRef.current?.triggerRelease(midiToNote(midi));
  }, []);

  return { state, activate, noteOn, noteOff, samplerRef };
}
