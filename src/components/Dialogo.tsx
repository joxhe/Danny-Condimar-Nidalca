import { useEffect, useRef } from 'react';
import { useDialogo } from '../store/dialogo';
import { IconoAlerta } from './Iconos';

/**
 * Dialogo de confirmacion.
 *
 * Usa el elemento `<dialog>` nativo con `showModal()`, que ya trae lo dificil
 * resuelto: atrapa el foco, cierra con Escape, apila el fondo correctamente y
 * marca el resto de la pagina como inerte para lectores de pantalla.
 */
export function Dialogo() {
  const actual = useDialogo((s) => s.actual);
  const responder = useDialogo((s) => s.responder);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (actual && !d.open) d.showModal();
    if (!actual && d.open) d.close();
  }, [actual]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // Escape cierra el dialogo por su cuenta: hay que enterarse para resolver
    // la promesa, o quien esta esperando se queda colgado para siempre.
    const alCerrar = () => useDialogo.getState().responder('cancelar');
    d.addEventListener('cancel', alCerrar);
    return () => d.removeEventListener('cancel', alCerrar);
  }, []);

  return (
    <dialog
      ref={ref}
      className={'dialogo' + (actual?.peligro ? ' dialogo-peligro' : '')}
      aria-labelledby="dialogo-titulo"
      onClick={(e) => {
        // Clic en el fondo: el target es el propio <dialog>, no su contenido.
        if (e.target === ref.current) responder('cancelar');
      }}
    >
      {actual && (
        <div className="dialogo-cuerpo">
          {actual.peligro && (
            <div className="dialogo-icono">
              <IconoAlerta tamano={22} />
            </div>
          )}

          <div>
            <h2 className="dialogo-titulo" id="dialogo-titulo">
              {actual.titulo}
            </h2>
            {actual.mensaje && <p className="dialogo-mensaje">{actual.mensaje}</p>}
          </div>

          <div className="dialogo-acciones">
            <button type="button" className="btn-fantasma" onClick={() => responder('cancelar')}>
              {actual.cancelar ?? 'Cancelar'}
            </button>
            {actual.alternativa && (
              <button
                type="button"
                className="btn-secundario"
                onClick={() => responder('alternativa')}
              >
                {actual.alternativa}
              </button>
            )}
            <button
              type="button"
              className={actual.peligro ? 'btn-destructivo' : 'btn-primario'}
              onClick={() => responder('confirmar')}
              autoFocus
            >
              {actual.confirmar ?? 'Continuar'}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
