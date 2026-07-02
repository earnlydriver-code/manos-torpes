/**
 * Pianista de conservatorio (Magenta melody_rnn): continúa las melodías del
 * corpus con un cerebro pre-entrenado por Google — gratis y local.
 */

type Props = {
  canCompose: boolean;
  busy: boolean;
  message: string | null;
  onCompose: () => void;
};

export function ConservatoryPanel({ canCompose, busy, message, onCompose }: Props) {
  return (
    <div className="guest">
      <div className="library-header">
        <h2>Pianista de conservatorio (Magenta)</h2>
        <span className="library-info">
          una red entrenada con miles de melodías reales continúa las tuyas — gratis, corre en tu
          navegador
        </span>
      </div>
      <div className="guest-row">
        <button
          className="primary"
          disabled={busy || !canCompose}
          onClick={onCompose}
          title={
            canCompose
              ? 'Toma un compás de tu corpus (o del mejor entrenado) y lo continúa con oficio'
              : 'Necesita corpus o un entrenamiento con mejor actual'
          }
        >
          {busy ? '🎓 Componiendo…' : '🎓 Continuar mi música'}
        </button>
        <span className="library-info">
          la frase pasa por el filtro de manos y queda en «Piezas guardadas»
        </span>
      </div>
      {message && <p className="guest-message">{message}</p>}
    </div>
  );
}
