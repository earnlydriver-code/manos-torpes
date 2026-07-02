# Manos Torpes 🎹 — una IA que aprende a tocar piano desde cero

Una app web donde un agente de aprendizaje evolutivo aprende a tocar un piano virtual con
las **restricciones físicas de un humano real**: dos manos, cinco dedos cada una, alcance
máximo de una octava y costo de movimiento. Escuchas la evolución en tiempo real, desde
ruido aleatorio hasta frases con pulso y tonalidad.

Todo corre **100% local en tu navegador**. Sin backend, sin nube.

Proyecto colaborativo entre el Usuario y Claude — decisiones y cambios registrados en
[BITACORA.md](./BITACORA.md).

## Arrancar

```bash
npm install
npm run dev      # abre http://localhost:5173
```

El sonido requiere un click en "Activar sonido" (política de autoplay de los navegadores).
Los samples del piano (Salamander Grand) se cargan desde el CDN oficial de Tone.js; para
trabajar offline, descárgalos a `public/samples/salamander/` y arranca con
`VITE_SAMPLES_BASE=/samples/salamander/`.

## Tests

```bash
npm test         # suite rápida: física de manos, recompensa, generación legal
npm run bench    # benchmark de convergencia (criterio de la spec: <2000 gens, <2 min)
```

## Arquitectura (Fases 0–2)

- `src/types/music.ts` — contrato de datos **congelado** (NoteEvent / Step / Genome).
- `src/engine/` — motor puro (sin DOM, sin Tone.js): física de manos, recompensa musical,
  generación de acciones legales y algoritmo genético. Corre igual en el Web Worker y en Vitest.
  - `hand-physics.js` y `reward.js` son el **código de referencia de la spec, portado tal
    cual** — los tests los validan; no se "mejoran".
- `src/workers/` — entrenamiento en Web Worker (la UI nunca se congela).
- `src/audio/` — sampler de piano real y reproductor de genomas (solo hilo principal).
- `src/components/` — teclado Canvas de 61 teclas, controles de entrenamiento, curva de recompensa.

## Reglas de oro del proyecto

1. El código de referencia de la spec no se edita; si un test falla, el sospechoso es el test o el port.
2. Todo cambio queda en un commit claro + entrada en BITACORA.md.
3. El costo de viaje de las manos se consulta **antes** de generar la acción del paso
   siguiente — nunca después (evita manos que se "teletransportan").
