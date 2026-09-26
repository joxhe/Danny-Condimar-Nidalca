import { create } from 'zustand';
import { uid } from '../domain';

export type TipoToast = 'ok' | 'error' | 'aviso';

export interface Toast {
  id: string;
  mensaje: string;
  tipo: TipoToast;
}

interface EstadoToast {
  toasts: Toast[];
  mostrar: (mensaje: string, tipo?: TipoToast) => void;
  cerrar: (id: string) => void;
}

/** Los errores se quedan mas tiempo: suelen traer algo que hay que leer. */
const DURACION: Record<TipoToast, number> = { ok: 2600, aviso: 4000, error: 6000 };

export const useToast = create<EstadoToast>((set) => ({
  toasts: [],

  mostrar: (mensaje, tipo = 'ok') => {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts, { id, mensaje, tipo }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, DURACION[tipo]);
  },

  cerrar: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Atajo para usar fuera de componentes. */
export const toast = {
  ok: (m: string) => useToast.getState().mostrar(m, 'ok'),
  error: (m: string) => useToast.getState().mostrar(m, 'error'),
  aviso: (m: string) => useToast.getState().mostrar(m, 'aviso'),
};
