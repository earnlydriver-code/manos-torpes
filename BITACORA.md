# Bitácora — Manos Torpes 🎹

Registro cronológico de decisiones y cambios del proyecto. **Regla de la casa:** todo cambio
de rumbo, decisión de diseño o desviación de la spec se anota aquí con autor, fecha y porqué.
Este proyecto es una colaboración entre el Usuario y Claude — ambos con voz y voto.

---

## 2026-07-01 — Fundación del proyecto

**Autores: Usuario + Claude**

- El Usuario aportó la spec completa ("SPEC — Manos Torpes: una IA que aprende a tocar piano
  desde cero", PDF de 8 páginas). Es la fuente de verdad del proyecto.
- **Decisión (Usuario):** alcance de la primera entrega = Fases 0–2 de la spec (scaffold +
  física de manos con tests + entrenamiento genético audible).
- **Decisión (Usuario delegó, Claude eligió):** TypeScript para la app. El código de
  referencia de la spec (`hand-physics.js`, `reward.js`) se porta como `.js` **sin tocar su
  lógica**, con archivos `.d.ts` hermanos para tipado.
- **Decisión (Usuario):** el proyecto vive en `C:\dev\manos-torpes`, fuera de OneDrive
  (evita problemas de sync con node_modules). En la carpeta original del Escritorio queda un
  LEEME.txt apuntando aquí.
- **Discusión (Usuario preguntó, Claude argumentó, Usuario aceptó):** ¿web o Python local?
  Se queda web como dice la spec. Motivo: todo corre local en el navegador igualmente; el ML
  de este proyecto es pequeño por diseño (genético + LSTM <100k params) y no gana nada con
  Python; el audio en tiempo real (Tone.js + Salamander Grand) y la UI Canvas son muy
  superiores en el navegador.

**Cambios de Claude en esta sesión:**
- Scaffold Vite + React + TypeScript (template oficial `react-ts`, Vite 8 / React 19 / TS 6).
- Git inicializado, primer commit del template puro.

## 2026-07-01 — Fases 0–2 completas (primera entrega)

**Autor: Claude** (plan aprobado por el Usuario)

- **Contrato de datos congelado** en `src/types/music.ts` (spec §9.3).
- **Código de referencia portado tal cual**: `hand-physics.js` y `reward.js`.
  - Adición sancionada en `hand-physics.js`: `export` de las constantes al final
    (sin tocar lógica) para no duplicarlas en el resto del motor.
  - Adición sancionada en `reward.js`: las líneas de `import` de los helpers
    (el esqueleto de la spec los asume en scope).
- **Corrección al plan (manda el código portado):** el plan decía
  `travelCost(60,65)=1.5`; el código portado redondea con `Math.ceil` a pasos
  enteros de semicorchea ⇒ `2`. Los tests siguen al código.
- **Decisión de implementación:** `ngramSelfSimilarity` opera sobre n-gramas de
  NOTAS (eventos de onset), no de pasos de reloj — la spec dice "n-gramas de
  notas" y con negras las ventanas de 4 semicorcheas quedaban siempre vacías.
- **Decisión de implementación:** las reglas ENTRE manos (≤10 notas, no
  atravesarse ±3 st) viven en `step-validator.ts` porque `validateHandShape`
  portado valida una sola mano.
- **Interpretación de la spec §6:** el slider de velocidad 1x–50x regula las
  generaciones/segundo del worker ("entrenando en silencio y sonando solo el
  mejor") — no la velocidad de reproducción del audio.
- **Motor genético** (población 64, torneo k=3, crossover en frontera de compás,
  elitismo 6): el benchmark falló 2 veces por escala débil (0.44, 0.52 < 0.6) y
  se iteró SOLO sobre operadores de mutación (regla del plan): pasos diatónicos
  sobre la escala detectada del genoma, transposición diatónica de compases,
  ancla tonal (tónica/quinta en el beat), registro por octavas/quintas.
- **Criterio de éxito de la spec §7 CUMPLIDO:** 2000 generaciones en 19 s
  (límite 120 s), best=0.814, pulso=0.775, escala=0.732, 100% físicamente legal.
  Reproducible con semilla 20260701 (`npm run bench`).
- Suite de 56 tests (`npm test`) + benchmark aparte (`npm run bench`).
- App completa: teclado Canvas 61 teclas clickeable con Salamander Grand,
  entrenamiento en Web Worker (la UI nunca se congela), curva best/avg en vivo,
  reproducción del mejor con colores por mano y números de dedo.
- Revisión adversarial multi-agente del motor lanzada al final de la sesión;
  hallazgos confirmados se corrigen y anotan aquí.

## 2026-07-01 — Revisión adversarial: 8 hallazgos, 6 corregidos

**Autor: Claude** (revisión con 12 agentes: 4 revisores por dimensión + verificadores escépticos)

Confirmados por verificador independiente y corregidos:
1. **Worker (major):** el freno de velocidad dormía hasta 12.5 s de un tirón —
   el contador saltaba de 25 en 25 y los comandos (velocidad, reset) no surtían
   efecto hasta que expiraba el sueño. Ahora: tandas pequeñas (~10/s) y sueño
   troceado en ≤100 ms re-chequeando estado.
2. **Hook useTrainer (major):** un `progress`/`newBest` en vuelo tras Reset
   repoblaba el estado recién limpiado (podía dejar "Reproducir mejor" apuntando
   a un genoma descartado). Ahora cada corrida lleva `runId` y los mensajes de
   corridas viejas se descartan.
3. **Audio (minor):** Detener no cortaba las notas ya disparadas (los releases
   van en tiempo absoluto del AudioContext, no en el Transport). Ahora
   `stopPlayback` llama `sampler.releaseAll()`.
4. **Teclado (minor):** un solo estado de tecla presionada dejaba notas
   atascadas con multi-touch. Ahora un mapa puntero→tecla (pointerId).

Válidos conceptualmente (los verificadores se quedaron sin cuota, verificados a mano) y corregidos:
5. **repairGenome borraba material legal:** usaba "nota más aguda = posición de
   la mano", así que mover un dedo DENTRO del alcance contaba como viaje. Ahora
   propaga el INTERVALO factible de anchors (una nota sola no determina dónde
   está la mano) y solo declara viaje cuando el onset cae fuera de todo el
   intervalo. `travelPenalty` usa la misma semántica (coherencia motor↔recompensa).
6. **Las notas sostenidas eran invisibles para la física:** una mano podía
   "sostener" una tecla y a la vez tocar a 14 semitonos. Ahora la reparación
   modela los sostenidos: dedo/tecla ocupados, forma combinada legal y soltar
   antes de viajar (truncando duraciones — menos destructivo que borrar).
   `randomGenome` también pasa por repair (los frescos cumplen el invariante).
7. **Al pausar, el gen mostrado quedaba desactualizado** (el mensaje `paused`
   se ignoraba): ahora sincroniza el contador.

Refutados por los verificadores (no eran bugs): 1 hallazgo de fidelidad del
port y variantes duplicadas de los anteriores.

Tests nuevos: sostenidos (2), anchor-ventana, idempotencia de repair (punto
fijo), invariante físico del mejor tras 100 generaciones. Total: **61 tests + bench**.
Bench tras el endurecimiento físico: 2000 gens en 30 s, best=0.800, pulso=0.766,
escala=0.725 — y el mejor individuo pasó de ~20 a ~47 notas (la reparación ya
no destruye material legal).

**Pendiente (fases futuras de la spec):** Fase 3 (manos animadas, recharts,
timeline de generaciones), Fase 4 (corpus MIDI/MP3 + Etapa 2), Fase 5 (feedback
humano 👍/👎 + IndexedDB + export del cerebro), Fase 6 (pulido + modo dueto).

## 2026-07-01 (noche) — Fase 3 + memoria entre sesiones

**Autores: Usuario (ideas) + Claude (implementación)**

- **Feedback del Usuario tras probar:** suena bien, pero el entrenamiento sube
  rápido, encuentra un sonido y se estanca; pidió que lo que el agente crea se
  guarde en memoria "para que cada vez sea mejor" y poder "borrar viejos".
- **Decisión conjunta:** adelantar la persistencia (que la spec ponía en la
  Fase 5) a esta entrega, en forma de **biblioteca de piezas** + **arranque en
  caliente**.

Fase 3 de la spec:
- **Manos animadas** en el teclado: una sombra por mano que se desliza suavemente
  sobre su alcance mientras suena (rAF con persecución exponencial).
- **Panel de aprendizaje con recharts**: curva best/promedio (con downsampling a
  ≤400 puntos) + desglose de la recompensa del mejor en barras (consonancia,
  ritmo, estructura, contorno, física, entropía; azul positivo / rojo negativo,
  paleta validada contra la superficie oscura con el validador de dataviz).
- **Máquina del tiempo**: el worker guarda una instantánea del mejor cada 50
  generaciones (y la gen 0); un slider permite escuchar cómo sonaba en la
  generación 0 vs ahora. El timeline se ralea si supera 160 snapshots.
- Nuevo `engine/reward-breakdown.ts`: espejo EXACTO de la fórmula del reward.js
  portado usando los mismos helpers, para la UI. Un test de propiedad (50
  genomas) garantiza que su total coincide con musicalReward a 12 decimales —
  si el portado cambiara, el test truena.

Idea del Usuario (memoria):
- **Biblioteca de piezas** en IndexedDB (`storage/library.ts`): botón «💾
  Guardar pieza» guarda el mejor actual; el panel lista, reproduce y borra
  piezas. Sobreviven al recargar la página.
- **Arranque en caliente**: checkbox «Partir de lo aprendido» — hasta media
  población inicial nace de las piezas guardadas (la primera copia de cada
  semilla intacta, el resto mutadas). `TrainConfig.seedGenomes` es opcional;
  el contrato congelado (NoteEvent/Step/Genome) NO se tocó.
- Sobre el estancamiento: es el techo de la Etapa 1 (la heurística tiene un
  máximo alcanzable). El salto real de calidad llega con la Fase 4 (aprender de
  música real) y la Fase 5 (tu gusto ajusta los pesos).

Idea del Usuario (conectar una IA): registrada para evaluar tras la Fase 4. La
"IA que aprende de verdad" del proyecto es la propia Etapa 2 (LSTM en TF.js
sobre MIDI reales, corre local en el navegador). Un LLM local (Ollama, etc.) no
toca piano de forma nativa, pero podría experimentarse como generador de
semillas en notación textual — fase extra opcional, decisión pendiente.

Tests: 61 → 67 (breakdown espejo ×4, arranque en caliente ×2). recharts añadido
(el bundle sube a ~232 KB gzip — aceptable para app local; code-splitting
anotado como mejora de la Fase 6).

## 2026-07-01 (noche) — Segunda revisión adversarial (Fase 3): 4 hallazgos, 4 corregidos

**Autor: Claude.** Los verificadores automáticos agotaron la cuota de la sesión,
así que los 4 hallazgos de los revisores se verificaron A MANO contra el código
antes de corregir (regla: ante la duda, no es bug — los 4 se sostenían):

1. **KeyboardCanvas (major):** la limpieza del efecto cancelaba el
   requestAnimationFrame pero no reseteaba `rafRef` a null — tras el doble
   montaje de StrictMode (React 19 en dev) el canvas quedaba sin redibujar
   para siempre. Corregido.
2. **library.ts:** la promesa se resolvía en `request.onsuccess`, que llega
   ANTES del commit de IndexedDB — un abort al confirmar (cuota llena) sería
   una pérdida silenciosa. Ahora resuelve en `transaction.oncomplete`.
3. **library.ts:** `db.close()` solo corría en `oncomplete`; cada transacción
   fallida filtraba una conexión. Ahora también cierra (y rechaza) en `onabort`.
4. **TrainerControls:** el tempo se clampaba en cada tecla — escribir "85" era
   imposible (el "8" se convertía en 60). Ahora se teclea libre y se valida al
   salir del campo (onBlur).

También: un revisor dejó un archivo temporal de prueba dentro del repo
(`__scratch_review.test.ts`); eliminado antes del commit.

## 2026-07-01 (madrugada) — Fase 4: Etapa 2 «Estudiante» (aprender de música real)

**Autor: Claude** (a petición del Usuario: "sigue con la fase 4")

**Decisión de diseño — Markov en vez de LSTM:** la spec permite "LSTM pequeña o
Markov de orden alto"; se eligió Markov de orden 3 sobre INTERVALOS de la voz
superior (JS puro, `engine/markov.ts`). Motivos: invariante a transposición
(aprende el dibujo melódico, no notas absolutas), sin dependencia de TF.js para
el entrenamiento (el bundle no crece), rápido, determinista y testeable. La
LSTM queda como mejora futura si el Markov se queda corto.

**Cómo aprende de tu música (spec §5):**
- `corpus/midi-import.ts`: cuantiza el MIDI a semicorcheas, parte en ventanas
  de N compases, reparte manos por la mediana, asigna digitación canónica y
  pasa TODO por el filtro físico (`repairGenome`) — el agente no imita notas
  que sus manos no alcanzan; encuentra su propia digitación (línea de la spec).
- `engine/corpus-blend.ts`: la recompensa de la Etapa 1 se MEZCLA (no se
  sustituye) con la similitud estadística al corpus (α=0.35). Las trampas del
  reward portado (silencio=-1, entropía<1.2) se respetan sin diluir.
- Mutador nuevo `corpusLick`: re-escribe la melodía de un compás caminando con
  intervalos muestreados del modelo (conserva el ritmo, inyecta el estilo).
- Los fragmentos del corpus también siembran la población inicial.
- UI: zona de arrastre MIDI/audio, lista de piezas del corpus con borrado,
  checkbox «Aprender del corpus» (Etapa 2), persistente en IndexedDB v2.

**MP3/WAV (experimental, spec §2):** Basic Pitch (Spotify, TF.js) corriendo en
un Web Worker con barra de progreso. VERIFICADO en Node antes de cablear: una
senoidal de 440 Hz se transcribe correctamente a MIDI 69 (La4); ~12 s por cada
3 s de audio en CPU. El modelo (~900 KB) viaja empaquetado con la app — sin
CDN. El tempo del audio se estima probando rejillas de 60-140 BPM. Límite de
4 min por archivo y aviso en UI de que la transcripción es aproximada (la spec
manda priorizar MIDI). Falta prueba end-to-end con grabaciones reales de piano:
pendiente de que el Usuario pruebe con sus archivos.

**Bug encontrado por los tests al construir:** el muestreo del Markov dependía
del orden de inserción del Map, que cambia al pasar por JSON (las claves
numéricas se reordenan) — misma semilla daba distinta música antes y después de
guardar. Corregido con orden numérico fijo; el test de serialización lo cubre.

Tests: 67 → 86 (Markov ×5, mezcla corpus ×7, import MIDI ×4, estimación BPM ×3).

## 2026-07-02 — Fase 5: Etapa 3 «Tu alumno» (feedback humano + cerebro)

**Autor: Claude** (a petición del Usuario: "con fase 5 directo"; el Usuario no
puede probar de inmediato — validado con tests y build, pendiente su oído)

- **`engine/taste.ts`** — el RLHF casero de la spec §5: cada 👍/👎 sobre lo que
  SUENA ajusta los PESOS de la recompensa (nunca la heurística interna).
  Actualización exponencial tipo bandit (Hedge): el componente que destacaba en
  lo que te gustó gana peso (η=0.25), con suelos y techos (3%–45%) para que
  ninguna defensa muera ni ningún gusto domine, y renormalizado a suma 1.
- Calificar funciona sobre lo que esté sonando: el mejor actual, un snapshot de
  la máquina del tiempo o una pieza guardada. Si lo que suena cae en una trampa
  (silencio/pocas notas), la calificación se rechaza con aviso — no enseña gusto.
- **En caliente:** al calificar durante un entrenamiento, el worker recibe
  `setWeights`, re-evalúa a TODA la población con la nueva vara de medir y
  re-anuncia el mejor (el récord viejo ya no vale — se resetea bestSoFar).
  Los entrenamientos nuevos parten de los pesos aprendidos.
- **Cerebro exportable (spec §5):** «⬇ Descargar cerebro» baja un JSON con
  gusto + piezas compuestas + corpus; «⬆ Cargar cerebro» lo restaura (el gusto
  se reemplaza, piezas y corpus se suman). Validación de formato al importar.
- Panel «Tu gusto»: barras con el peso actual de cada componente, contador de
  calificaciones y botón «Olvidar mi gusto» (pesos de fábrica).
- IndexedDB v3: almacén 'estado' clave-valor para el gusto.
- **LEEME.txt del Escritorio actualizado** (petición del Usuario): tipos de
  archivo aceptados y 4 sitios de MIDI gratis verificados (bitmidi.com,
  mutopiaproject.org, freemidi.org, piano-midi.de).

Tests: 86 → 91 (gusto ×5: dirección del update, suma 1, suelos/techos tras 100
calificaciones, sin señal no hay cambio, estado inicial de la spec).

**Con esto quedan completas las Fases 0–5. Falta la Fase 6:** pulido (code-
splitting del bundle, rendimiento), modo dueto, y evaluar el experimento de la
IA local como generador de semillas.

## 2026-07-02 — Auto tempo y compases (petición del Usuario durante las pruebas)

**Autor: Claude** (Usuario: "¿cómo voy a saber qué tempo y compases ponerle a
cada canción? ¿puedes hacer que eso él lo decida de alguna manera lógica?")

- **`corpus/suggest.ts`**: sugerencia automática con lógica explicable —
  tempo = MEDIANA de los tempos reales de las piezas (el MIDI lo trae en la
  cabecera; el audio se estimó al importar); compases = por densidad de
  ataques (≥8 ataques/compás ⇒ 2 compases; 5–8 ⇒ 3; <5 ⇒ 4 — la música
  espaciada necesita más aire para decir una frase).
- Checkbox **«🎯 Auto según el corpus»** (activado por defecto cuando hay
  corpus): tempo y compases se deciden solos y muestran el porqué; se puede
  desmarcar para control manual.
- El importador ahora corta cada pieza en ventanas de 2, 3 **y** 4 compases a
  la vez (`windowsByBars`): las semillas existen para cualquier tamaño que se
  elija — antes solo existían para el tamaño seleccionado al importar. La
  melodía del Markov sale del corte más largo (contextos más ricos). Piezas
  ya importadas (viejas) siguen funcionando: siembran solo a 2 compases y su
  tempo se lee de sus ventanas.
- La lista del corpus muestra el BPM real de cada pieza.

Tests: 91 → 96 (sugerencia ×4 + corte multi-tamaño). Nota: las piezas que el
Usuario ya importó conviene RE-IMPORTARLAS (borrar + arrastrar de nuevo) para
que tengan cortes de 3/4 compases y BPM real.

## 2026-07-02 — EXPLOIT cazado por el oído del Usuario (y corregido)

**Autores: Usuario (detección) + Claude (diagnóstico y arreglo)**

El Usuario reportó que con corpus "no crea nada lógico" incluso tras 15 min de
entrenamiento. El diagnóstico con su MIDI real (Sadness and Sorrow) reveló un
exploit de manual — la spec §8 avisaba: "el agente encuentra la trampa de la
métrica antes que la música":

- **Causa raíz:** `melodyIntervals` tomaba la nota más aguda de cada step SIN
  distinguir manos. Cuando la derecha descansaba, "la melodía" saltaba al bajo
  ⇒ el modelo aprendió saltos falsos de ±2 octavas como rasgo del estilo ⇒ el
  agente descubrió que un ping-pong infinito de dos octavas (alternando manos,
  físicamente gratis) puntuaba similitud 1.000 y recompensa 0.849. Sonaba
  horrible con nota perfecta.
- **Arreglo 1:** melodía = voz superior de la MANO DERECHA solamente.
- **Arreglo 2 (defensa nueva):** la similitud se escala por DIVERSIDAD de
  intervalos comparada con la del corpus (un bucle de 2 intervalos ya no puede
  puntuar como música real, por probable que sea).
- **Curación automática:** el modelo se reconstruye desde los fragmentos
  guardados re-extrayendo melodías con el extractor corregido — las piezas ya
  importadas se curan solas, sin re-importar.
- **Verificación con el MIDI real (mismo experimento, 3000 gens):** el mejor
  pasó de ping-pong ±24 a un motivo con repetición variada
  (-7,3,-1,-9,9,2 → repetido → variado), contorno 0.28→0.43, sim honesta 0.85.
- Regla de la casa cumplida: el exploit quedó como test de regresión
  (ping-pong ≤0.45 de similitud; melodías solo-izquierda no contaminan).

Tests: 96 → 99.

## 2026-07-02 — Fase 6 (1/2): OÍDO VERTICAL — armonía de simultaneidades

**Autores: Usuario (pidió "enséñale armonía / cuándo va una disonancia" y
aportó el dato clave: la gen 0 sonaba casi a Sadness and Sorrow y miles de
generaciones DESPUÉS sonaba peor) + Claude (diseño e implementación)**

- **Desviación de la spec decidida juntos:** la heurística portada mide
  consonancia contra la escala pero no escucha qué suena A LA VEZ — dos notas
  correctas de la escala pueden chocar (2ª menor sostenida) sin castigo. Ni el
  gusto (Etapa 3) podía arreglarlo: solo re-pesa componentes que existen.
- **`engine/harmony.ts` — verticalConsonance ∈ [0,1]:** puntúa los choques
  simultáneos (incluidas notas SOSTENIDAS de steps anteriores) con la regla
  real de la música: 2ªm/7ªM/tritono ásperos; nota de paso breve y a
  contratiempo casi no cuenta; choque sostenido duele siempre, caiga donde
  caiga. El peor choque define cada momento (sumar pares infla acordes).
- **Integración FUERA del reward.js portado** (sigue intacto): el fitness del
  genético resta hasta 0.3 por choques (`HARMONY_WEIGHT`), con las trampas del
  portado intactas. Aplica con y sin corpus.
- **Calibración contra la música real del Usuario:** las ventanas de Sadness
  and Sorrow puntúan 0.95 de media (min 0.69) — el oído no castiga lo que un
  pianista real hace.
- **Verificación anti-degradación (el dato del Usuario, reproducido):** con
  corpus + armonía, a las 3.000 generaciones el mejor tiene vertical 1.000
  (cero choques), similitud 0.70 (por ENCIMA de la gen 0: ya no se aleja del
  estilo) y melodía por grados con saltos compensados. El bench de la spec
  sigue verde (2000 gens/28 s, best 0.835, pulso 0.87, escala 0.74).

Tests: 99 → 104 (acorde limpio=1, monofonía=1, 2ªm sostenida <0.4, nota de
paso >0.85 y mejor que el choque sostenido, choque con sostenida de antes).

## 2026-07-02 — Fase 6 (2/2): cierre — LA SPEC QUEDA COMPLETA

- **Decisión (Usuario): el modo dueto NO se hace** — "no pienso tocar yo". La
  spec lo marcaba como stretch/opcional (§6.7); descartado sin deuda.
- **Decisión (Claude, registrada): el code-splitting del bundle se declara
  innecesario** — es una app 100% local servida desde localhost; los ~232 KB
  gzip de recharts no le cuestan nada a nadie. Hacerlo sería trabajo sin
  beneficiario. El worker de transcripción (1.8 MB de TF.js) ya carga solo
  bajo demanda, que era lo único que importaba.
- Con esto, **las Fases 0–6 de la spec están completas** (dueto descartado por
  decisión). Lo que siga ya es evolución del proyecto más allá de la spec:
  las ideas anotadas abajo (LSTM, progresiones de acordes, estiramientos con
  contexto, IA local como generador de semillas) se deciden juntos.

## 2026-07-02 — Mejora 1/4: PROGRESIONES DE ACORDES (armonía horizontal)

**Autores: Usuario (aprobó el plan de 4 mejoras, una a una, tras verificar con
30k generaciones que el techo era la recompensa, no el cómputo) + Claude**

- **`engine/chords.ts`**: detector de acordes por medio compás (tríadas M/m
  con raíz ponderada; cobertura <0.6 ⇒ 'N', no se inventa acorde) expresados
  como GRADOS relativos a la tonalidad Krumhansl (invariante a transposición:
  una progresión aprendida en La menor sirve en Do). `ChordModel`: cadena de
  transiciones acorde→acorde con Laplace, serializable, sample determinista.
- **`harmonicSimilarity` ∈ [0,1]**: ¿los acordes existen (chordness) y se
  suceden como en el corpus? Entra en la recompensa mezclada: el parecido al
  corpus ahora tiene dos oídos — melodía 55% + armonía 45%.
- **Mutador `chordAccompaniment`**: la mano izquierda ACOMPAÑA — muestrea el
  acorde siguiente de las progresiones aprendidas y acerca sus notas graves a
  las notas de ese acorde (conserva el ritmo).
- **Calibración con el MIDI real del Usuario:** detecta las progresiones de
  Sadness and Sorrow con solo 12% de segmentos 'N'; ejemplo real aprendido:
  3M → 10M → 0m → 0m → 5m. Entrenamiento (3.000 gens): armonía 1.000,
  vertical 1.000, cero regresiones (111 tests + bench verdes).

Con esto el agente tiene los dos oídos armónicos: el vertical evita lo feo,
el horizontal construye lo bello. Siguientes en la cola acordada: 2)
estiramientos con contexto, 3) LSTM + piezas largas, 4) IA local (Ollama).

## 2026-07-02 — Mejora 2/4: ESTIRAMIENTOS CON CONTEXTO (idea del Usuario)

**Autores: Usuario (la idea: "que considere cuándo vale la pena ese
estiramiento incómodo, pero no siempre") + Claude (implementación)**

- `avgStrain` ahora detecta los CLÍMAX melódicos (steps cuya nota más aguda
  corona todo lo que suena a ±8 steps, con material por debajo — una línea
  plana no tiene picos) y ahí la tensión física cuesta solo el 35%: como un
  pianista real, que acepta la incomodidad cuando la frase lo vale.
- Sin tocar reward.js portado: avgStrain es helper nuestro; el contrato
  ([0,1], strain del validador portado) se mantiene.
- Feedback del Usuario tras la mejora 1/4: "sonó mucho mejor... aún repetitivo,
  como ritmos de 3 notas consecutivas". El diagnóstico apunta al Markov de
  orden 3 (memoria corta) — es EXACTAMENTE lo que la mejora 3/4 (LSTM +
  piezas más largas) ataca. Anotado como criterio de éxito de esa fase.

Tests: 111 → 114 (mismo estirón cuesta menos en el clímax; línea plana sin
picos no descuenta nada; sin tensión el contexto no inventa). Bench verde.

## 2026-07-03 — Mejora 3/4: LSTM COMPOSITORA + Markov crítico de orden 5

**Autores: Usuario (pidió la LSTM; su queja medible: "motivos repetitivos de
3 notas", y seguía oyendo disonancia) + Claude (implementación y mediciones)**

**Arquitectura (decisión razonada):** la LSTM NO puntúa genomas — un forward
por evaluación × ~192k evaluaciones por corrida rompería el criterio de <2 min
de la spec. Papeles separados: la LSTM es la COMPOSITORA (genera frases con
memoria de 16 intervalos que el mutador de licks inyecta) y el Markov, subido
de orden 3 → 5, es el CRÍTICO rápido. La spec permite ambos ("LSTM pequeña o
Markov de orden alto, fallback a Markov puro").

- `engine/lstm.ts`: forward puro JS que replica EXACTAMENTE tf.layers.lstm
  (verificado en test: coincide con TF.js a <1e-4). Corre en el worker sin
  TF.js, determinista. ~11k parámetros (spec pedía <100k).
- `corpus/lstm-train.ts`: entrenamiento con TF.js en el hilo principal
  (import dinámico: sus MB no cargan hasta que hay corpus), una vez por
  corpus, con caché en IndexedDB por firma del corpus. Corpus muy pequeño ⇒
  null ⇒ compone el Markov (fallback de la spec). Estado visible en la UI.
- **Medición honesta con los MIDI reales del Usuario** (métrica: % del
  3-grama de intervalos más repetido; la música real da ~12%):
  · 1 pieza: LSTM 29% (colapso de modo) vs Markov-5 11% — la LSTM perdía.
  · 4 piezas: LSTM 14% vs Markov-5 8%.
  · Con TEMPERATURA de muestreo 1.5 (el remedio clásico al colapso): LSTM
    9-10% con el mejor fitness (0.831) — empatada con Markov y con 3x más
    memoria para cuando el corpus crezca. Se activa con T=1.5.
- **HARMONY_WEIGHT 0.3 → 0.45**: el Usuario seguía oyendo disonancia tras la
  1/4; la música real puntúa ~0.95 de consonancia vertical, así que el
  aumento castiga a los tramposos sin rozar el estilo real.
- El test de equivalencia TF.js↔JS puro resultó flaky por el init no sembrado
  de TF.js (14/30 muestras vs umbral 15): endurecido con argmax + umbral
  realista.

Tests: 114 → 117 (equivalencia TF.js, aprendizaje de frase larga, fallback,
GA con LSTM determinista y legal). Bench de la spec verde (34 s).

## 2026-07-03 — Prueba de la 3/4: dos bugs cazados por el Usuario (y corregidos)

**Autores: Usuario (reportó "notas que se sobreponen constantemente" y que la
LSTM decía "corpus pequeño" con 8 piezas/226 fragmentos) + Claude**

1. **Agujero físico — la misma tecla dos veces:** el modelo permitía que las
   dos manos pisaran la MISMA tecla a la vez (imposible: es una sola tecla) y
   que una nota se re-pisara mientras la anterior seguía sonando (el martillo
   real corta la nota anterior). Se oía como doblaje fantasma / solapes.
   · `validateStep`: tecla única entre AMBAS manos (antes solo por mano).
   · `repairGenome` paso A2: al re-pisar una tecla, la nota anterior se trunca
     en ese instante. Aplica también al corpus importado (verificado: 0
     solapes en Naruto/Queen/Pirates tras el arreglo).
2. **La LSTM nunca entrenó en la app** (por eso "compone el modelo simple" con
   corpus grande): la primera carga dinámica de TF.js dispara la
   re-optimización del dev server, que RECARGA la página y mata el intento; el
   estado quedaba en respaldo sin reintentar. Arreglos: TF.js pre-bundleado
   (optimizeDeps), 3 reintentos con espera, y estado 'error' separado de
   'respaldo' con mensaje claro en la UI.
3. El test de equivalencia LSTM volvió a ser flaky (init de TF.js sin sembrar):
   aserción cambiada a "probabilidad ≥5x azar y top-3" — 3 corridas estables.

Tests: 117 → 119. Pendiente que el Usuario re-pruebe: la LSTM debería decir
"entrenando… → lista" y los solapes desaparecer. (Nota: tiene Naruto duplicado
en el corpus — cuenta doble, se le avisó.)

## 2026-07-03 — Mejora 4/4: COMPOSITORA INVITADA (Ollama) — plan de 4 completo

**Autores: Usuario (la idea original: "¿y si conectamos una IA? tengo varias
en mi PC"; delegó la elección del modelo) + Claude (diseño, implementación y
elección razonada)**

- **Arquitectura "la invitada propone, la física dispone":** la IA local
  escribe una frase de 2 compases en JSON (rejilla de semicorcheas, melodía +
  bajo) y pasa por el MISMO pipeline físico que un MIDI real
  (importFromNotes → repair → validate): sale con manos humanas o no sale.
  Sus piezas van a la BIBLIOTECA como semillas del próximo entrenamiento —
  deliberadamente NO al corpus (los modelos de melodía/acordes solo aprenden
  de música real; la invitada inspira, no enseña).
- **Elección de modelo (medida, no de oídas):** el Usuario tiene 4 generativos
  instalados. Elegido `qwen2.5-coder:7b` — los modelos de código son los más
  fiables emitiendo JSON estricto (nuestra interfaz ES una partitura JSON), la
  base qwen2.5 trae teoría musical decente, y 7B corre bien en su PC.
  Verificado end-to-end contra su Ollama real: JSON válido a la primera
  (86 s con carga del modelo incluida), escala melancólica en Do menor
  coherente. Los demás quedan en el desplegable: deepseek-r1 soportado (el
  parser quita sus bloques <think>), dolphin-llama3 y mateo-v4 disponibles;
  nomic-embed excluido (no genera).
- **Parseo robusto testeado:** <think>, vallas ```json, texto alrededor,
  campos fuera de rango (se recortan), basura/JSON roto/pocas notas ⇒ error
  claro sin explotar. UI: selector de modelo + campo de estilo libre
  ("triste y lento", "épico"...) + resultado con la nota de la heurística.
- **Timeouts falsos en la suite:** el GA (orden 5 + armonía + más mutadores)
  roza los 5 s por defecto de vitest en paralelo — subido a 120 s
  (eran timeouts, no bugs; verificado en serie).

Tests: 119 → 126. **El plan post-spec de 4 mejoras queda COMPLETO:**
1/4 acordes ✅ · 2/4 estiramientos con contexto ✅ · 3/4 LSTM ✅ · 4/4 invitada ✅.

## 2026-07-03 — Mejora 5: RITMO APRENDIDO + MODO CANCIÓN

**Autores: Usuario (las dos quejas exactas: "no sabe tener ritmo" y "no son
composiciones largas") + Claude (diagnóstico e implementación)**

**Diagnóstico del ritmo:** el corpus enseñaba MELODÍA (intervalos) y ARMONÍA
(acordes) pero el RITMO de las piezas reales nunca se inyectaba — los genomas
ritmaban al azar y solo pulseConsistency (≈12% del total) empujaba un poco.

- **`engine/rhythm.ts`**: banco de figuras rítmicas reales — los patrones de
  onset+duración de cada compás del corpus, POR MANO (el ritmo de la melodía
  no es el del acompañamiento), rankeados por frecuencia (top 80).
- **Mutador `rhythmLick`** (peso 0.2): re-tima un compás de una mano con una
  figura real del corpus; las alturas existentes se recolocan en orden sobre
  los onsets del patrón. La melodía la ponen otros mutadores; el groove, este.

**Composiciones largas — ENMIENDA AL CONTRATO (decidida con el Usuario, que
las pidió): `Genome.bars` pasa de 2|3|4 a number.** El ENTRENAMIENTO sigue en
2-4 compases (donde el genético converge bien); las piezas largas se
construyen con forma musical:
- **`engine/song.ts` — composeSong:** estructura A-A'-B-A''-coda. A = el tema
  entrenado tal cual; A' y A'' variaciones ligeras (2 mutaciones); B contraste
  (6); cada variación gana entre 4 candidatos por recompensa. Coda: la tónica
  detectada, sostenida en ambas manos, EN LA OCTAVA MÁS CERCANA a donde cada
  mano quedó (la primera versión plantaba registros fijos y la propia regla
  de viaje de repairGenome borraba el acorde final — la física nos auditó).
  La reparación global cose las costuras entre secciones.
- Botón **«🎶 Canción»**: convierte el mejor actual en una canción de 9
  compases (~29 s a 75 BPM), la guarda en la biblioteca y la reproduce.

Tests: 126 → 131. Bench de la spec verde.

## 2026-07-03 — EXPLOIT nº4 (cazado por el Usuario): el vacío como consonancia

**Autores: Usuario (el dato: "literal fueron 3 notas mano izq y 7 mano
derecha, no tiene mucha armonía") + Claude (diagnóstico y arreglo)**

- **El exploit:** el oído vertical castiga choques pero tocar casi nada
  garantiza cero choques — el agente aprendió a CALLARSE para cobrar la
  consonancia. Las defensas de silencio total (-1) y entropía (≥3 clases de
  tono) no lo frenan: 10 notas bien elegidas las pasan.
- **El arreglo — `engine/texture.ts`:** tercera similitud al corpus, la
  TEXTURA: ataques por compás y voces simultáneas de la música real como
  referencia. El parecido penaliza por igual el vacío y el atiborramiento
  (min/max ratio). Mezcla: melodía 45 / armonía 35 / textura 20 dentro de α.
- **Verificado con el MIDI real del Usuario** (mismo experimento, 3.000
  gens): textura real 7.3 atq/compás y 2.4 voces → sin textura el mejor
  tocaba 20 notas (1.7 voces); con textura toca 28 (9.0 atq/compás, 2.1
  voces, la izquierda pasa de 9 a 20 notas — ACOMPAÑA) con vertical 1.00.
- Museo de trampas al día: silencio → una-nota → ping-pong ±24 → vacío
  parcial. Cada una tiene su test de regresión.

Tests: 131 → 135.

## Ideas anotadas durante las pruebas del Usuario (2026-07-02)

- **Idea (Usuario): estiramientos "que valgan la pena".** Hoy el trade-off es
  plano: la física castiga igual un estiramiento en un momento cualquiera que
  en un clímax musical. La idea es que el agente considere CUÁNDO vale la pena
  la incomodidad (p. ej. tolerar tensión si el salto corona una frase o un
  clímax de contorno) pero no siempre. Candidato para Fase 6: modular la
  penalización física según el contexto musical del step (posición en la
  frase, pico del contorno). NO implementar sin decidirlo juntos.
- **Visión (Usuario): componer solo con el tiempo + gustos propios/del usuario.**
  Ruta acordada: después de las pruebas → LSTM (sustituir/complementar el
  Markov) para estructura larga.
- **Idea (Usuario, durante prueba con corpus lento a 4 compases): "¿no falta
  teoría musical / pentatónica?"** Diagnóstico del momento: el modo Auto eligió
  4 compases (lienzo 2x más grande ⇒ converge más lento) y el estilo imitado
  es escaso por naturaleza — no era falta de teoría. PERO el hueco real
  señalado existe: no hay ARMONÍA (progresiones de acordes, cadencias,
  tensión/reposo). La pentatónica ya está cubierta indirectamente (subconjunto
  de la mayor en Krumhansl). Candidato fuerte para la siguiente fase: modelo
  de progresión armónica (detectar acordes por compás del corpus + premiar
  progresiones aprendidas), complementario a la LSTM.
