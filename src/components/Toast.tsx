import { useToast } from '../store/toast';

/** Avisos apilados abajo. En movil quedan sobre el pulgar, no bajo el. */
export function Toasts() {
  const toasts = useToast((s) => s.toasts);
  const cerrar = useToast((s) => s.cerrar);

  if (!toasts.length) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`toast toast-${t.tipo}`}
          onClick={() => cerrar(t.id)}
          title="Cerrar"
        >
          {t.mensaje}
        </button>
      ))}
    </div>
  );
}
