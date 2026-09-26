import { create } from 'zustand';

export interface PeticionDialogo {
  titulo: string;
  mensaje?: string;
  /** Texto del boton que confirma. Por defecto "Continuar". */
  confirmar?: string;
  cancelar?: string;
  /** Pinta el boton de confirmar en rojo: la accion no se puede deshacer. */
  peligro?: boolean;
}

interface EstadoDialogo {
  actual: (PeticionDialogo & { resolver: (v: boolean) => void }) | null;
  responder: (valor: boolean) => void;
}

export const useDialogo = create<EstadoDialogo>((set, get) => ({
  actual: null,
  responder: (valor) => {
    const actual = get().actual;
    if (!actual) return;
    actual.resolver(valor);
    set({ actual: null });
  },
}));

/**
 * Confirmacion, con la misma ergonomia que `window.confirm` pero asincrona.
 *
 *   if (!(await confirmar({ titulo: '¿Borrar?', peligro: true })) return;
 *
 * Se reemplaza al nativo porque bloquea el hilo, no se puede estilar y en
 * movil aparece como un cartel del sistema que no se parece a la aplicacion.
 *
 * Se expone como funcion suelta y no como hook para poder llamarla desde
 * dentro de manejadores asincronos sin arrastrar dependencias.
 */
export function confirmar(peticion: PeticionDialogo): Promise<boolean> {
  const { actual, responder } = useDialogo.getState();
  // Si ya habia uno abierto se cancela: nunca se apilan dos preguntas.
  if (actual) responder(false);

  return new Promise<boolean>((resolver) => {
    useDialogo.setState({ actual: { ...peticion, resolver } });
  });
}
