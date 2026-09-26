import type { ItemPedido, Producto } from './types';

/**
 * Precio unitario.
 *
 * Desde el listado 2025 las dos lineas manejan un precio unico: ya no existe
 * la distincion Detallista / Distribuidor que tenia la app anterior.
 */
export function precioUnit(producto: Producto | ItemPedido): number {
  return Number(producto.precio) || 0;
}

/**
 * Impuestos del articulo, en porcentaje.
 *
 * Condimar liquida IVA (19%) e ICUI (0% o 20%). Nidalca solo IVA, que segun la
 * categoria es 5% o 19%.
 */
export function impuestosPct(producto: Producto | ItemPedido): {
  iva: number;
  icui: number;
} {
  const iva = Number(producto.iva) || 0;
  if (producto.linea === 'NIDALCA') return { iva, icui: 0 };
  return { iva, icui: Number(producto.icui) || 0 };
}
