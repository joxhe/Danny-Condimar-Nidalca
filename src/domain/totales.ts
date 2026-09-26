import { impuestosPct, precioUnit } from './precios';
import type { ItemPedido, Totales } from './types';

export const TOTALES_CERO: Totales = {
  bruto: 0,
  descuento: 0,
  subtotal: 0,
  iva: 0,
  icui: 0,
  total: 0,
};

export interface LineaCalculada {
  bruto: number;
  descuento: number;
  /** Bruto menos descuento: sobre esto se liquidan los impuestos. */
  base: number;
  iva: number;
  icui: number;
}

/** Liquidacion de un solo renglon del pedido. */
export function calcularLinea(item: ItemPedido): LineaCalculada {
  const precio = precioUnit(item);
  const pct = impuestosPct(item);
  const bruto = precio * (Number(item.cantidad) || 0);
  const descuento = (bruto * (Number(item.descuentoPct) || 0)) / 100;
  const base = bruto - descuento;
  return {
    bruto,
    descuento,
    base,
    iva: (base * pct.iva) / 100,
    icui: (base * pct.icui) / 100,
  };
}

/**
 * Totales del pedido.
 *
 * Se acumula en punto flotante y se redondea solo al presentar, igual que la
 * version original. Cambiarlo a redondeo por renglon alteraria importes de
 * pedidos ya emitidos, asi que se preserva a proposito.
 */
export function computeTotales(items: ItemPedido[]): Totales {
  const acc = items.reduce(
    (t, item) => {
      const l = calcularLinea(item);
      t.bruto += l.bruto;
      t.descuento += l.descuento;
      t.iva += l.iva;
      t.icui += l.icui;
      return t;
    },
    { bruto: 0, descuento: 0, iva: 0, icui: 0 },
  );

  const subtotal = acc.bruto - acc.descuento;

  return {
    ...acc,
    subtotal,
    total: subtotal + acc.iva + acc.icui,
  };
}
