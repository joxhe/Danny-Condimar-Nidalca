import { create } from 'zustand';

export interface PeticionDialogo {
  titulo: string;
  mensaje?: string;
  /** Texto del boton que confirma. Por defecto "Continuar". */
  confirmar?: string;
  cancelar?: string;
  /** Tercer boton, entre cancelar y confirmar. Sin texto no se muestra. */
  alternativa?: string;
  /** Pinta el boton de confirmar en rojo: la accion no se puede deshacer. */
  peligro?: boolean;
}

/** Cerrar con Escape o tocando el fondo cuenta como cancelar. */
export type Respuesta = 'confirmar' | 'alternativa' | 'cancelar';

interface EstadoDialogo {
  actual: (PeticionDialogo & { resolver: (r: Respuesta) => void }) | null;
  responder: (r: Respuesta) => void;
}

export const useDialogo = create<EstadoDialogo>((set, get) => ({
  actual: null,
  responder: (r) => {
    const actual = get().actual;
    if (!actual) return;
    actual.resolver(r);
    set({ actual: null });
  },
}));

/**
 * Pregunta con hasta tres respuestas.
 *
 *   const r = await preguntar({ titulo, confirmar: 'Descargar', alternativa: 'Compartir' });
 *
 * Se expone como funcion suelta y no como hook para poder llamarla desde
 * dentro de manejadores asincronos sin arrastrar dependencias.
 */
export function preguntar(peticion: PeticionDialogo): Promise<Respuesta> {
  const { actual, responder } = useDialogo.getState();
  // Si ya habia uno abierto se cancela: nunca se apilan dos preguntas.
  if (actual) responder('cancelar');

  return new Promise<Respuesta>((resolver) => {
    useDialogo.setState({ actual: { ...peticion, resolver } });
  });
}

/**
 * Confirmacion, con la misma ergonomia que `window.confirm` pero asincrona.
 *
 *   if (!(await confirmar({ titulo: '¿Borrar?', peligro: true })) return;
 *
 * Se reemplaza al nativo porque bloquea el hilo, no se puede estilar y en
 * movil aparece como un cartel del sistema que no se parece a la aplicacion.
 */
export async function confirmar(peticion: PeticionDialogo): Promise<boolean> {
  return (await preguntar(peticion)) === 'confirmar';
}
