import { calcularLinea } from './totales';
import type { Linea, Pedido } from './types';

/**
 * Fila de ventas por articulo.
 *
 * Es el informe generico de ventas, distinto del Informe semanal por
 * referencia que el cliente entrega a sus superiores. Ese vive en
 * `informeSemanal.ts`.
 */
export interface FilaVentas {
  linea: Linea;
  categoria: string;
  producto: string;
  cantidad: number;
  bruto: number;
  descuento: number;
  /** Base + impuestos: lo que efectivamente se factura por ese articulo. */
  neto: number;
}

export interface GranTotales {
  cantidad: number;
  bruto: number;
  descuento: number;
  neto: number;
}

export interface FiltroInforme {
  desde: string;
  hasta: string;
  linea: Linea | 'todas';
}

export interface Informe extends FiltroInforme {
  filas: FilaVentas[];
  granTotales: GranTotales;
  cantPedidos: number;
}

/**
 * Ventas agregadas por linea / categoria / articulo en un rango de fechas.
 * Solo cuenta pedidos finalizados: los borradores no son venta.
 */
export function construirInforme(pedidos: Pedido[], filtro: FiltroInforme): Informe {
  const finalizados = pedidos.filter(
    (p) =>
      p.estado === 'finalizado' &&
      p.fecha >= filtro.desde &&
      p.fecha <= filtro.hasta &&
      (filtro.linea === 'todas' || p.linea === filtro.linea),
  );

  const mapa = new Map<string, FilaVentas>();

  for (const pedido of finalizados) {
    for (const item of pedido.items) {
      const l = calcularLinea(item);
      const clave = `${pedido.linea}||${item.categoria}||${item.producto}`;
      const fila = mapa.get(clave) ?? {
        linea: pedido.linea,
        categoria: item.categoria,
        producto: item.producto,
        cantidad: 0,
        bruto: 0,
        descuento: 0,
        neto: 0,
      };
      fila.cantidad += Number(item.cantidad) || 0;
      fila.bruto += l.bruto;
      fila.descuento += l.descuento;
      fila.neto += l.base + l.iva + l.icui;
      mapa.set(clave, fila);
    }
  }

  const filas = Array.from(mapa.values()).sort(
    (a, b) =>
      a.linea.localeCompare(b.linea) ||
      a.categoria.localeCompare(b.categoria) ||
      b.neto - a.neto,
  );

  const granTotales = filas.reduce<GranTotales>(
    (acc, f) => ({
      cantidad: acc.cantidad + f.cantidad,
      bruto: acc.bruto + f.bruto,
      descuento: acc.descuento + f.descuento,
      neto: acc.neto + f.neto,
    }),
    { cantidad: 0, bruto: 0, descuento: 0, neto: 0 },
  );

  return { ...filtro, filas, granTotales, cantPedidos: finalizados.length };
}

