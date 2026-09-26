import { describe, expect, it } from 'vitest';
import { COP } from './formato';
import { precioUnit } from './precios';
import { calcularLinea, computeTotales } from './totales';
import type { ItemPedido } from './types';

function itemCondimar(p: Partial<ItemPedido> & { precio: number }): ItemPedido {
  return {
    linea: 'CONDIMAR',
    id: 'PC-001',
    lineId: 'x',
    categoria: 'General',
    producto: 'ART',
    iva: 0,
    icui: 0,
    embalaje: 100,
    referenciaId: '1X100',
    cantidad: 1,
    descuentoPct: 0,
    observaciones: '',
    ...p,
  } as ItemPedido;
}

function itemNidalca(p: Partial<ItemPedido> & { precio: number }): ItemPedido {
  return {
    linea: 'NIDALCA',
    id: 'PN-001',
    lineId: 'x',
    categoria: 'Granel',
    referenciaId: 'GRANEL',
    producto: 'ART',
    iva: 5,
    cantidad: 1,
    descuentoPct: 0,
    observaciones: '',
    ...p,
  } as ItemPedido;
}

describe('regresion contra produccion: pedido Condimar No. 5', () => {
  // Importes tomados del PDF emitido por la version anterior (08/09/2026,
  // cliente GIL DE RINCON MARTHA F.). La app nueva debe dar lo mismo al peso.
  const items = [
    itemCondimar({ producto: 'COLOR X 500', precio: 5063, cantidad: 16, descuentoPct: 10, iva: 19, icui: 20 }),
    itemCondimar({ producto: 'COMINO X 500', precio: 13638, cantidad: 16, descuentoPct: 10, iva: 19, icui: 20 }),
    itemCondimar({ producto: 'PIMIENTA MOL X 500', precio: 5563, cantidad: 16, descuentoPct: 10, iva: 19, icui: 20 }),
  ];

  it('reproduce los subtotales por renglon', () => {
    const subtotales = items.map((it) => {
      const l = calcularLinea(it);
      return COP(l.bruto - l.descuento);
    });
    expect(subtotales).toEqual(['$72.907', '$196.387', '$80.107']);
  });

  it('reproduce el bloque de totales', () => {
    const t = computeTotales(items);
    expect(COP(t.bruto)).toBe('$388.224');
    expect(COP(t.descuento)).toBe('$38.822');
    expect(COP(t.subtotal)).toBe('$349.402'); // 388.224 - 38.822
    expect(COP(t.iva)).toBe('$66.386');
    expect(COP(t.icui)).toBe('$69.880');
    expect(COP(t.total)).toBe('$485.668');
  });
});

describe('subtotal', () => {
  it('siempre es bruto menos descuento, y el total parte de el', () => {
    const t = computeTotales(
      [
        itemCondimar({ precio: 1000, cantidad: 3, descuentoPct: 20, iva: 19, icui: 20 }),
        itemCondimar({ precio: 500, cantidad: 4, descuentoPct: 0, iva: 19, icui: 0 }),
      ],
    );
    expect(t.subtotal).toBeCloseTo(t.bruto - t.descuento, 6);
    expect(t.total).toBeCloseTo(t.subtotal + t.iva + t.icui, 6);
  });
});

describe('computeTotales', () => {
  it('devuelve ceros sin articulos', () => {
    expect(computeTotales([])).toEqual({
      bruto: 0, descuento: 0, subtotal: 0, iva: 0, icui: 0, total: 0,
    });
  });

  it('liquida los impuestos sobre la base, no sobre el bruto', () => {
    const t = computeTotales(
      [itemCondimar({ precio: 1000, cantidad: 10, descuentoPct: 50, iva: 19, icui: 0 })],
    );
    expect(t.bruto).toBe(10000);
    expect(t.descuento).toBe(5000);
    expect(t.subtotal).toBe(5000); // sobre esto se liquidan los impuestos
    expect(t.iva).toBe(950); // 19% de 5000, no de 10000
    expect(t.total).toBe(5950);
  });

  it('Nidalca no liquida IVA ni ICUI', () => {
    const t = computeTotales(
      [itemNidalca({ precio: 2000, cantidad: 4, iva: 5 })],
    );
    expect(t.bruto).toBe(8000);
    expect(t.iva).toBe(400); // 5% de la categoria de alimentos
    expect(t.icui).toBe(0); // Nidalca no liquida ICUI
    expect(t.total).toBe(8400);
  });

  it('trata cantidades y descuentos invalidos como cero', () => {
    const t = computeTotales(
      [itemCondimar({ precio: 500, cantidad: NaN, descuentoPct: NaN, iva: 19 })],
    );
    expect(t.total).toBe(0);
  });
});

describe('precioUnit', () => {
  it('las dos lineas manejan un precio unico', () => {
    expect(precioUnit(itemNidalca({ precio: 2000 }))).toBe(2000);
    expect(precioUnit(itemCondimar({ precio: 900 }))).toBe(900);
  });
});
