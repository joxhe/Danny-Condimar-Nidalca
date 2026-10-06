import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { computeTotales, noAntesDeHoy, todayISO, uid } from '../domain';
import type {
  Cliente,
  ItemPedido,
  Linea,
  Pedido,
  Producto,
} from '../domain/types';

interface EstadoBorrador {
  linea: Linea;
  orderId: string | null;
  numero: string | number | null;
  fecha: string;
  cliente: Cliente | null;
  items: ItemPedido[];
  obsGenerales: string;
}

interface AccionesBorrador {
  setLinea: (linea: Linea) => void;
  setCliente: (cliente: Cliente | null) => void;
  setFecha: (f: string) => void;
  setObsGenerales: (o: string) => void;
  setNumero: (n: string | number) => void;
  /**
   * Fija la identidad del pedido antes de guardarlo por primera vez, y la
   * devuelve. Sin esto cada guardado generaba un id nuevo con el mismo numero:
   * dos filas distintas en la hoja, las dos con el mismo No. de pedido.
   */
  asegurarId: () => string;
  /** Agrega el articulo al principio y devuelve el id de su renglon. */
  agregarProducto: (p: Producto) => string;
  actualizarItem: (lineId: string, patch: Partial<ItemPedido>) => void;
  quitarItem: (lineId: string) => void;
  limpiar: () => void;
  cargarDesde: (pedido: Pedido) => void;
  construir: (estado: Pedido['estado'], numero: string | number) => Pedido;
  tieneContenido: () => boolean;
}

const INICIAL: EstadoBorrador = {
  linea: 'CONDIMAR',
  orderId: null,
  numero: null,
  fecha: todayISO(),
  cliente: null,
  items: [],
  obsGenerales: '',
};

/**
 * El pedido en curso. Se persiste en localStorage: si el celular mata la
 * pestania a media captura, el vendedor la recupera intacta al volver.
 */
export const usePedidoBorrador = create<EstadoBorrador & AccionesBorrador>()(
  persist(
    (set, get) => ({
      ...INICIAL,

      setLinea: (linea) => set({ ...INICIAL, fecha: todayISO(), linea }),
      setCliente: (cliente) => set({ cliente }),
      setFecha: (fecha) => set({ fecha }),
      setObsGenerales: (obsGenerales) => set({ obsGenerales }),
      setNumero: (numero) => set({ numero }),

      asegurarId: () => {
        const actual = get().orderId;
        if (actual) return actual;
        const id = uid();
        set({ orderId: id });
        return id;
      },

      /*
       * El ultimo agregado va arriba, pegado al buscador: es el que hay que
       * completar con la cantidad. Al final quedaba debajo de todos los demas
       * y habia que bajar a buscarlo en cada articulo.
       */
      agregarProducto: (p) => {
        const lineId = uid();
        set((s) => ({
          items: [
            { ...p, lineId, cantidad: 1, descuentoPct: 0, observaciones: '' },
            ...s.items,
          ],
        }));
        return lineId;
      },

      actualizarItem: (lineId, patch) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.lineId === lineId ? ({ ...it, ...patch } as ItemPedido) : it,
          ),
        })),

      quitarItem: (lineId) =>
        set((s) => ({ items: s.items.filter((it) => it.lineId !== lineId) })),

      limpiar: () => set((s) => ({ ...INICIAL, fecha: todayISO(), linea: s.linea })),

      cargarDesde: (pedido) =>
        set({
          linea: pedido.linea,
          orderId: pedido.id,
          numero: pedido.numero,
          // Un borrador de ayer se despacha hoy: la fecha se adelanta sola.
          fecha: noAntesDeHoy(pedido.fecha),
          cliente: pedido.cliente,
          items: pedido.items.map((it) => ({ ...it, lineId: uid() })),
          obsGenerales: pedido.obsGenerales ?? '',
        }),

      construir: (estado, numero) => {
        const s = get();
        return {
          id: s.orderId ?? uid(),
          numero,
          linea: s.linea,
          cliente: s.cliente as Cliente,
          fecha: s.fecha,
          items: s.items,
          obsGenerales: s.obsGenerales,
          totales: computeTotales(s.items),
          estado,
          updatedAt: new Date().toISOString(),
        };
      },

      tieneContenido: () => {
        const s = get();
        return s.items.length > 0 || s.cliente !== null;
      },
    }),
    { name: 'pedido_borrador_v1' },
  ),
);
