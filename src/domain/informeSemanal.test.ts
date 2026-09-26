import { describe, expect, it } from 'vitest';
import { construirInformeSemanal, rangoDelCorte } from './informeSemanal';
import { computeTotales } from './totales';
import type { Corte, ItemPedido, Pedido, Presupuesto, Referencia } from './types';

// --- Andamiaje -------------------------------------------------------------

const REFERENCIAS: Referencia[] = [
  { id: '1X100', linea: 'CONDIMAR', etiqueta: '1x100', orden: 1 },
  { id: 'BOLSA-INST', linea: 'CONDIMAR', etiqueta: 'BOLSA INST', orden: 2 },
  { id: 'LAMINADOS', linea: 'NIDALCA', etiqueta: 'LAMINADOS', orden: 3 },
];

const PRESUPUESTOS: Presupuesto[] = [
  { linea: 'CONDIMAR', referenciaId: '1X100', anio: 2026, mes: 9, metaCajas: 70, metaPesos: 0 },
  { linea: 'CONDIMAR', referenciaId: 'BOLSA-INST', anio: 2026, mes: 9, metaCajas: 230, metaPesos: 0 },
  { linea: 'CONDIMAR', referenciaId: 'TOTAL', anio: 2026, mes: 9, metaCajas: 0, metaPesos: 102314380 },
  { linea: 'NIDALCA', referenciaId: 'TOTAL', anio: 2026, mes: 9, metaCajas: 0, metaPesos: 25530960 },
];

const CORTES: Corte[] = [1, 2, 3, 4].map((semana) => ({
  id: `2026-09-S${semana}`,
  anio: 2026,
  mes: 9,
  semana,
  titulo: `semana ${semana}`,
  ciudad: 'MONTERIA',
  fechaCorte: '',
  cerrado: false,
}));

function item(p: {
  producto: string;
  referenciaId: string;
  embalaje: number;
  cantidad: number;
  precio?: number;
}): ItemPedido {
  return {
    linea: 'CONDIMAR',
    id: 'PC-001',
    lineId: p.producto + p.cantidad,
    categoria: 'General',
    producto: p.producto,
    precio: p.precio ?? 1000,
    iva: 0,
    icui: 0,
    embalaje: p.embalaje,
    referenciaId: p.referenciaId,
    cantidad: p.cantidad,
    descuentoPct: 0,
    observaciones: '',
  };
}

function pedido(fecha: string, items: ItemPedido[], numero = 1): Pedido {
  return {
    id: fecha + numero,
    numero,
    linea: 'CONDIMAR',
    cliente: { id: 'CC-001', razon_social: 'X', nit: '', dv: '', direccion: '', ciudad: '', telefono: '', plazo_credito: 30, compro: true, activo: true },
    fecha,
    items,
    obsGenerales: '',
    totales: computeTotales(items),
    estado: 'finalizado',
    updatedAt: fecha,
  };
}

const armar = (corteSemana: number, pedidos: Pedido[]) =>
  construirInformeSemanal({
    corte: CORTES[corteSemana - 1],
    cortes: CORTES,
    pedidos,
    referencias: REFERENCIAS,
    presupuestos: PRESUPUESTOS,
  });

const fila = (inf: ReturnType<typeof armar>, id: string) =>
  inf.filas.find((f) => f.referenciaId === id)!;

// --- Rango -----------------------------------------------------------------

describe('rango del corte', () => {
  it('sin fecha de corte reparte el mes en semanas de siete dias', () => {
    expect(rangoDelCorte(CORTES[0], CORTES)).toEqual({ desde: '2026-09-01', hasta: '2026-09-07' });
    expect(rangoDelCorte(CORTES[1], CORTES)).toEqual({ desde: '2026-09-08', hasta: '2026-09-14' });
  });

  it('la ultima semana se estira hasta fin de mes', () => {
    expect(rangoDelCorte(CORTES[3], CORTES).hasta).toBe('2026-09-30');
  });

  it('si la hoja trae fecha de corte, manda esa', () => {
    const conFecha = CORTES.map((c, i) =>
      i === 0 ? { ...c, fechaCorte: '2026-09-05' } : c,
    );
    expect(rangoDelCorte(conFecha[0], conFecha).hasta).toBe('2026-09-05');
    expect(rangoDelCorte(conFecha[1], conFecha).desde).toBe('2026-09-06');
  });
});

// --- La regla de las cajas --------------------------------------------------

describe('acumulacion de cajas entre cortes', () => {
  const treinta = pedido('2026-09-03', [
    item({ producto: 'PIMIENTA X 10', referenciaId: '1X100', embalaje: 100, cantidad: 30 }),
  ]);
  const ochenta = pedido('2026-09-10', [
    item({ producto: 'PIMIENTA X 10', referenciaId: '1X100', embalaje: 100, cantidad: 80 }),
  ], 2);

  it('30 unidades en la semana 1 no suman ninguna caja', () => {
    const f = fila(armar(1, [treinta]), '1X100');
    expect(f.nuevoAcumulado).toBe(0);
    expect(f.ventasSemana).toBe(0);
  });

  it('las 80 de la semana 2 completan la caja que quedo pendiente', () => {
    const f = fila(armar(2, [treinta, ochenta]), '1X100');
    expect(f.acumAnterior).toBe(0); // lo que habia al cerrar la semana 1
    expect(f.ventasSemana).toBe(1); // aparece ahora
    expect(f.nuevoAcumulado).toBe(1);
  });

  it('las unidades no se mezclan entre articulos distintos', () => {
    // 30 + 40 = 70 unidades, pero de dos productos: ninguna caja de 100.
    const mezcla = pedido('2026-09-10', [
      item({ producto: 'PIMIENTA X 10', referenciaId: '1X100', embalaje: 100, cantidad: 30 }),
      item({ producto: 'CLAVOS X 10', referenciaId: '1X100', embalaje: 100, cantidad: 40 }),
    ]);
    expect(fila(armar(2, [mezcla]), '1X100').nuevoAcumulado).toBe(0);
  });
});

// --- Estructura de la tabla -------------------------------------------------

describe('estructura, igual a la hoja del cliente', () => {
  const inf = armar(2, [
    pedido('2026-09-09', [
      item({ producto: 'COMINO X 500', referenciaId: 'BOLSA-INST', embalaje: 16, cantidad: 32, precio: 13638 }),
    ]),
  ]);

  it('lleva una fila por referencia y un total por linea', () => {
    expect(inf.filas.map((f) => f.etiqueta)).toEqual([
      '1x100',
      'BOLSA INST',
      'TOTAL CONDIMAR',
      'LAMINADOS',
      'TOTAL NIDALCA',
    ]);
  });

  it('las referencias van en cajas y los totales en pesos', () => {
    expect(fila(inf, 'BOLSA-INST').unidad).toBe('cajas');
    expect(inf.filas.filter((f) => f.esTotal).every((f) => f.unidad === 'pesos')).toBe(true);
  });

  it('nuevo acumulado es acumulado anterior mas ventas de la semana', () => {
    for (const f of [...inf.filas, inf.granTotal]) {
      expect(f.acumAnterior + f.ventasSemana).toBeCloseTo(f.nuevoAcumulado, 6);
    }
  });

  it('falta es presupuesto menos acumulado', () => {
    const f = fila(inf, 'BOLSA-INST');
    expect(f.nuevoAcumulado).toBe(2); // 32 unidades / 16 por caja
    expect(f.presupuesto).toBe(230);
    expect(f.falta).toBe(228);
    expect(f.pctCumplimiento).toBeCloseTo(2 / 230, 6);
  });

  it('sin presupuesto el cumplimiento es nulo, no cero por ciento', () => {
    // Decir 0% afirmaria que no se cumplio; lo cierto es que no hay meta.
    expect(fila(inf, 'LAMINADOS').pctCumplimiento).toBeNull();
  });

  it('el gran total suma los totales de las dos lineas', () => {
    const totales = inf.filas.filter((f) => f.esTotal);
    expect(inf.granTotal.nuevoAcumulado).toBeCloseTo(
      totales.reduce((s, f) => s + f.nuevoAcumulado, 0),
      6,
    );
    expect(inf.granTotal.presupuesto).toBe(102314380 + 25530960);
  });
});

// --- Que entra y que no -----------------------------------------------------

describe('que pedidos entran', () => {
  const dentro = pedido('2026-09-10', [
    item({ producto: 'A', referenciaId: 'BOLSA-INST', embalaje: 16, cantidad: 16 }),
  ]);

  it('los borradores no son venta', () => {
    const borrador = { ...dentro, estado: 'borrador' as const, id: 'b1' };
    expect(fila(armar(2, [borrador]), 'BOLSA-INST').nuevoAcumulado).toBe(0);
  });

  it('los de otro mes quedan afuera', () => {
    const agosto = { ...dentro, fecha: '2026-08-10', id: 'ago' };
    expect(fila(armar(2, [agosto]), 'BOLSA-INST').nuevoAcumulado).toBe(0);
  });

  it('los posteriores al corte tampoco entran', () => {
    const despues = { ...dentro, fecha: '2026-09-20', id: 'tarde' };
    expect(fila(armar(2, [despues]), 'BOLSA-INST').nuevoAcumulado).toBe(0);
  });

  it('un articulo sin referencia no rompe el informe', () => {
    const huerfano = pedido('2026-09-10', [
      item({ producto: 'X', referenciaId: '', embalaje: 10, cantidad: 100 }),
    ]);
    expect(() => armar(2, [huerfano])).not.toThrow();
  });
});


describe('los totales van en venta neta', () => {
  it('excluye IVA e ICUI: el Informe mide venta, no recaudo', () => {
    const conImpuestos = item({
      producto: 'COMINO X 500',
      referenciaId: 'BOLSA-INST',
      embalaje: 16,
      cantidad: 16,
      precio: 1000,
    });
    conImpuestos.iva = 19;
    if (conImpuestos.linea === 'CONDIMAR') conImpuestos.icui = 20;

    const inf = armar(2, [pedido('2026-09-09', [conImpuestos])]);
    const total = inf.filas.find((f) => f.esTotal && f.linea === 'CONDIMAR')!;

    // 16 x $1.000 = $16.000 netos. Con impuestos serian $22.240.
    expect(total.nuevoAcumulado).toBe(16000);
  });

  it('el descuento sí se resta del neto', () => {
    const conDescuento = item({
      producto: 'X',
      referenciaId: 'BOLSA-INST',
      embalaje: 16,
      cantidad: 10,
      precio: 1000,
    });
    conDescuento.descuentoPct = 20;

    const inf = armar(2, [pedido('2026-09-09', [conDescuento])]);
    const total = inf.filas.find((f) => f.esTotal && f.linea === 'CONDIMAR')!;
    expect(total.nuevoAcumulado).toBe(8000);
  });
});
