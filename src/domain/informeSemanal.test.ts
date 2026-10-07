import { describe, expect, it } from 'vitest';
import { construirInformeSemanal, informeAFilasDeHoja } from './informeSemanal';
import type { Periodo } from './periodos';
import { computeTotales } from './totales';
import { ajustesEditados, aplicarAjustes, idDevolucion, idInicial } from './ajustes';
import type { Ajuste, ItemPedido, Pedido, Presupuesto, Referencia } from './types';

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

/** Las semanas de septiembre 2026 que usa el cliente: 7-12, 14-19 y 21-26. */
const SEMANAS: Periodo[] = [
  { desde: '2026-09-07', hasta: '2026-09-12' },
  { desde: '2026-09-14', hasta: '2026-09-19' },
  { desde: '2026-09-21', hasta: '2026-09-26' },
];

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

const armarPeriodo = (periodo: Periodo, pedidos: Pedido[], ajustes: Ajuste[] = []) =>
  construirInformeSemanal({
    periodo,
    pedidos,
    referencias: REFERENCIAS,
    presupuestos: PRESUPUESTOS,
    ajustes,
  });

const armar = (numeroSemana: number, pedidos: Pedido[]) =>
  armarPeriodo(SEMANAS[numeroSemana - 1], pedidos);

const fila = (inf: ReturnType<typeof armar>, id: string) =>
  inf.filas.find((f) => f.referenciaId === id)!;

// --- La regla de las cajas --------------------------------------------------

describe('acumulacion de cajas entre semanas', () => {
  const treinta = pedido('2026-09-08', [
    item({ producto: 'PIMIENTA X 10', referenciaId: '1X100', embalaje: 100, cantidad: 30 }),
  ]);
  const ochenta = pedido('2026-09-15', [
    item({ producto: 'PIMIENTA X 10', referenciaId: '1X100', embalaje: 100, cantidad: 80 }),
  ], 2);

  it('30 unidades en la semana 1 no suman ninguna caja', () => {
    const f = fila(armar(1, [treinta]), '1X100');
    expect(f.nuevoAcumulado).toBe(0);
    expect(f.ventasSemana).toBe(0);
  });

  it('las 80 de la semana 2 completan la caja que quedo pendiente', () => {
    const f = fila(armar(2, [treinta, ochenta]), '1X100');
    expect(f.acumAnterior).toBe(0); // lo que habia al cerrar la semana 1 (sabado 12)
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

  it('los posteriores al sabado de la semana tampoco entran', () => {
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

describe('periodo elegido en el calendario', () => {
  const bolsa = (fecha: string) =>
    pedido(fecha, [
      item({ producto: 'COMINO X 500', referenciaId: 'BOLSA-INST', embalaje: 16, cantidad: 16 }),
    ]);

  it('lo vendido antes del periodo, desde el dia 1, va al ACUM. ANTERIOR', () => {
    // Del 1 al 5 de septiembre no es semana completa, pero el acumulado del
    // mes empieza el dia 1, asi que esa venta no se pierde.
    const f = fila(armar(1, [bolsa('2026-09-03')]), 'BOLSA-INST');
    expect(f.acumAnterior).toBe(1);
    expect(f.ventasSemana).toBe(0);
    expect(f.nuevoAcumulado).toBe(1);
  });

  it('los dias del 28 al 30 se informan como periodo propio', () => {
    const inf = armarPeriodo({ desde: '2026-09-28', hasta: '2026-09-30' }, [
      bolsa('2026-09-15'),
      bolsa('2026-09-29'),
    ]);
    const f = fila(inf, 'BOLSA-INST');
    expect(f.acumAnterior).toBe(1); // la del 15
    expect(f.ventasSemana).toBe(1); // la del 29
    expect(f.nuevoAcumulado).toBe(2);
    expect(inf.pedidosContados).toBe(1);
  });

  it('un periodo de un solo dia cuenta solo ese dia', () => {
    const inf = armarPeriodo({ desde: '2026-09-29', hasta: '2026-09-29' }, [
      bolsa('2026-09-29'),
      bolsa('2026-09-30'),
    ]);
    expect(fila(inf, 'BOLSA-INST').ventasSemana).toBe(1);
    expect(inf.pedidosContados).toBe(1);
  });

  it('el presupuesto es el del mes del periodo', () => {
    const inf = armarPeriodo({ desde: '2026-09-28', hasta: '2026-09-30' }, []);
    expect(fila(inf, 'BOLSA-INST').presupuesto).toBe(230);
  });

  it('el titulo nombra el periodo', () => {
    expect(armar(1, []).titulo).toBe('del 7 al 12 de septiembre de 2026');
  });

  it('en la hoja, cada periodo se guarda con su propio id', () => {
    const filas = informeAFilasDeHoja(armar(2, []));
    expect(new Set(filas.map((f) => f.corte_id))).toEqual(new Set(['2026-09-14_2026-09-19']));
  });
});

// --- Ajustes a mano: acumulado fuera de la app y devoluciones -------------

describe('ajustes a mano del Informe', () => {
  const bolsa = (fecha: string, cantidad = 16) =>
    pedido(fecha, [
      item({ producto: 'COMINO X 500', referenciaId: 'BOLSA-INST', embalaje: 16, cantidad }),
    ]);

  const SEMANA_2 = SEMANAS[1]; // 14 al 19
  const SEMANA_3 = SEMANAS[2]; // 21 al 26

  const inicial = (valor: number, referenciaId = 'BOLSA-INST'): Ajuste => ({
    id: idInicial(2026, 9, 'CONDIMAR', referenciaId),
    tipo: 'inicial',
    anio: 2026,
    mes: 9,
    desde: '',
    hasta: '',
    linea: 'CONDIMAR',
    referenciaId,
    valor,
  });

  const devolucion = (periodo: Periodo, valor: number, referenciaId = 'BOLSA-INST'): Ajuste => ({
    id: idDevolucion(periodo, 'CONDIMAR', referenciaId),
    tipo: 'devolucion',
    anio: 2026,
    mes: 9,
    desde: periodo.desde,
    hasta: periodo.hasta,
    linea: 'CONDIMAR',
    referenciaId,
    valor,
  });

  it('el acumulado escrito a mano suma en todos los periodos del mes', () => {
    // Se empezo a usar la app con el mes andando: 40 cajas vendidas antes.
    for (const periodo of SEMANAS) {
      const f = fila(armarPeriodo(periodo, [], [inicial(40)]), 'BOLSA-INST');
      expect(f.acumAnterior).toBe(40);
      expect(f.nuevoAcumulado).toBe(40);
      expect(f.ajusteInicial).toBe(40);
    }
  });

  it('el ajuste se suma a lo que traen los pedidos, no lo reemplaza', () => {
    const inf = armarPeriodo(SEMANA_3, [bolsa('2026-09-15'), bolsa('2026-09-22')], [inicial(40)]);
    const f = fila(inf, 'BOLSA-INST');
    expect(f.acumAnterior).toBe(41); // 40 a mano + 1 del 15
    expect(f.ventasSemana).toBe(1); // la del 22
    expect(f.nuevoAcumulado).toBe(42);
  });

  it('una devolucion resta del nuevo acumulado en su periodo', () => {
    const inf = armarPeriodo(SEMANA_2, [bolsa('2026-09-15', 48)], [devolucion(SEMANA_2, 1)]);
    const f = fila(inf, 'BOLSA-INST');
    expect(f.ventasSemana).toBe(3);
    expect(f.devoluciones).toBe(1);
    expect(f.nuevoAcumulado).toBe(2);
  });

  it('en el periodo siguiente ya viene restada del acumulado anterior', () => {
    const inf = armarPeriodo(SEMANA_3, [bolsa('2026-09-15', 48)], [devolucion(SEMANA_2, 1)]);
    const f = fila(inf, 'BOLSA-INST');
    expect(f.acumAnterior).toBe(2); // el nuevo acumulado de la semana 2
    expect(f.devoluciones).toBe(0);
    expect(f.nuevoAcumulado).toBe(2);
  });

  it('no toca los periodos que terminan antes de registrarla', () => {
    const f = fila(armarPeriodo(SEMANAS[0], [], [devolucion(SEMANA_3, 5)]), 'BOLSA-INST');
    expect(f.devoluciones).toBe(0);
    expect(f.acumAnterior).toBe(0);
  });

  it('los ajustes de otro mes no cuentan', () => {
    const octubre = { ...inicial(40), id: 'otro', mes: 10 };
    expect(fila(armarPeriodo(SEMANA_2, [], [octubre]), 'BOLSA-INST').acumAnterior).toBe(0);
  });

  it('el total en pesos se ajusta en su propia fila', () => {
    const inf = armarPeriodo(SEMANA_2, [bolsa('2026-09-15')], [
      inicial(500000, 'TOTAL'),
      devolucion(SEMANA_2, 4000, 'TOTAL'),
    ]);
    const total = inf.filas.find((f) => f.esTotal && f.linea === 'CONDIMAR')!;
    expect(total.acumAnterior).toBe(500000);
    expect(total.ventasSemana).toBe(16000);
    expect(total.devoluciones).toBe(4000);
    expect(total.nuevoAcumulado).toBe(512000);
    // El gran total suma los totales ya ajustados.
    expect(inf.granTotal.devoluciones).toBe(4000);
    expect(inf.granTotal.nuevoAcumulado).toBe(512000);
  });

  it('siempre: anterior + ventas - devoluciones = nuevo acumulado', () => {
    const inf = armarPeriodo(SEMANA_3, [bolsa('2026-09-15', 80), bolsa('2026-09-23', 64)], [
      inicial(7),
      devolucion(SEMANA_2, 2),
      devolucion(SEMANA_3, 1),
      inicial(900000, 'TOTAL'),
    ]);
    for (const f of [...inf.filas, inf.granTotal]) {
      expect(f.acumAnterior + f.ventasSemana - f.devoluciones).toBeCloseTo(f.nuevoAcumulado, 6);
    }
  });
});

describe('lo que se escribe en la tabla', () => {
  const bolsa = (fecha: string) =>
    pedido(fecha, [
      item({ producto: 'COMINO X 500', referenciaId: 'BOLSA-INST', embalaje: 16, cantidad: 16 }),
    ]);
  const SEMANA_3 = SEMANAS[2];

  it('el acumulado escrito se guarda como diferencia con lo que trae la app', () => {
    const f = fila(armarPeriodo(SEMANA_3, [bolsa('2026-09-15')]), 'BOLSA-INST');
    expect(f.acumAnterior).toBe(1);

    const [cambio] = ajustesEditados(f, SEMANA_3, { acumAnterior: 50 }, []);
    expect(cambio.tipo).toBe('inicial');
    expect(cambio.valor).toBe(49);

    // Con el ajuste aplicado, la tabla muestra exactamente lo escrito.
    const inf = armarPeriodo(SEMANA_3, [bolsa('2026-09-15')], aplicarAjustes([], [cambio]));
    expect(fila(inf, 'BOLSA-INST').acumAnterior).toBe(50);
  });

  it('dejar la cifra como estaba no crea ningun ajuste', () => {
    const f = fila(armarPeriodo(SEMANA_3, [bolsa('2026-09-15')]), 'BOLSA-INST');
    expect(ajustesEditados(f, SEMANA_3, { acumAnterior: 1, devoluciones: 0 }, [])).toEqual([]);
  });

  it('en pesos se compara redondeado: no aparecen ajustes de centavos', () => {
    const total = armarPeriodo(SEMANA_3, []).filas.find((x) => x.esTotal)!;
    const conCentavos = { ...total, acumAnterior: 1000.4 };
    expect(ajustesEditados(conCentavos, SEMANA_3, { acumAnterior: 1000 }, [])).toEqual([]);
  });

  it('las devoluciones escritas quedan registradas en el periodo', () => {
    const f = fila(armarPeriodo(SEMANA_3, []), 'BOLSA-INST');
    const [cambio] = ajustesEditados(f, SEMANA_3, { devoluciones: 3 }, []);
    expect(cambio).toMatchObject({
      tipo: 'devolucion',
      desde: '2026-09-21',
      hasta: '2026-09-26',
      valor: 3,
    });
  });

  it('borrar una devolucion la deja en cero, y en cero desaparece', () => {
    const f = fila(armarPeriodo(SEMANA_3, []), 'BOLSA-INST');
    const [puesta] = ajustesEditados(f, SEMANA_3, { devoluciones: 3 }, []);
    const conDevolucion = fila(armarPeriodo(SEMANA_3, [], [puesta]), 'BOLSA-INST');

    const [quitada] = ajustesEditados(conDevolucion, SEMANA_3, { devoluciones: 0 }, [puesta]);
    expect(quitada.valor).toBe(0);
    expect(aplicarAjustes([puesta], [quitada])).toEqual([]);
  });
});
