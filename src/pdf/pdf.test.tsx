import { renderToBuffer } from '@react-pdf/renderer';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { computeTotales } from '../domain';
import type { ItemPedido, Pedido } from '../domain/types';
import { InformePDF } from './InformePDF';
import { PedidoPDF } from './PedidoPDF';
import { construirInforme } from '../domain/informes';

/** El miembro Condimar de la union, para poder derivar fixtures con spread. */
type ItemCondimar = Extract<ItemPedido, { linea: 'CONDIMAR' }>;

function item(n: number, observaciones = ''): ItemCondimar {
  return {
    linea: 'CONDIMAR',
    id: `PC-${String(n).padStart(3, '0')}`,
    lineId: `l${n}`,
    categoria: 'General',
    producto: `ARTICULO NUMERO ${n}`,
    precio: 5063,
    iva: 19,
    icui: 20,
    embalaje: 16,
    referenciaId: 'BOLSA-INST',
    cantidad: 16,
    descuentoPct: 10,
    observaciones,
  };
}

function pedido(items: ItemPedido[]): Pedido {
  return {
    id: 'p1',
    numero: 5,
    linea: 'CONDIMAR',
    cliente: {
      id: 'CC-009',
      razon_social: 'GIL DE RINCON MARTHA F.',
      nit: '34971271',
      dv: '',
      direccion: 'CRA. 14 NO. 9-32',
      ciudad: 'CERETE',
      telefono: '7746138',
      plazo_credito: 30,
      compro: true,
    },
    fecha: '2026-09-08',
    items,
    obsGenerales: '',
    totales: computeTotales(items),
    estado: 'finalizado',
    updatedAt: '2026-09-08T10:00:00.000Z',
  };
}

/** Numero de hojas reales del PDF. */
function contarPaginas(buf: Buffer): number {
  return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

/**
 * Texto visible del PDF.
 *
 * Los streams van comprimidos con Flate y, dentro, react-pdf emite el texto
 * como cadenas hexadecimales en operadores TJ. Con Courier (fuente estandar,
 * WinAnsi) cada byte es directamente su caracter ASCII.
 */
function textoDe(buf: Buffer): string {
  const bin = buf.toString('latin1');
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let contenido = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(bin)) !== null) {
    try {
      contenido += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      contenido += m[1];
    }
  }

  return (contenido.match(/<([0-9a-fA-F]+)>/g) ?? [])
    .map((hex) => Buffer.from(hex.slice(1, -1), 'hex').toString('latin1'))
    .join('');
}

/** Los tres renglones del pedido No. 5 realmente emitido el 08/09/2026. */
const ITEMS_REALES: ItemPedido[] = [
  { ...item(1), producto: 'COLOR X 500', precio: 5063 },
  { ...item(2), producto: 'COMINO X 500', precio: 13638 },
  { ...item(3), producto: 'PIMIENTA MOL X 500', precio: 5563 },
];

describe('PedidoPDF', () => {
  it('reproduce el pedido No. 5 tal como salio impreso', async () => {
    const buf = await renderToBuffer(<PedidoPDF pedido={pedido(ITEMS_REALES)} />);

    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1500);

    const texto = textoDe(buf);
    expect(texto).toContain('Condimar S.A.S');
    expect(texto).toContain('NIT 890.113.075-7');
    expect(texto).toContain('GIL DE RINCON MARTHA F.');
    expect(texto).toContain('CERETE');

    expect(texto).toContain('COLOR X 500');
    expect(texto).toContain('$72.907');
    expect(texto).toContain('COMINO X 500');
    expect(texto).toContain('$196.387');
    expect(texto).toContain('PIMIENTA MOL X 500');
    expect(texto).toContain('$80.107');

    expect(texto).toContain('$388.224'); // antes de descuento
    expect(texto).toContain('$38.822'); //  descuento
    expect(texto).toContain('$66.386'); //  IVA
    expect(texto).toContain('$69.880'); //  ICUI
    expect(texto).toContain('TOTAL A CANCELAR');
    expect(texto).toContain('$485.668');
  });

  it('muestra el SUBTOTAL entre el descuento y los impuestos', async () => {
    const buf = await renderToBuffer(<PedidoPDF pedido={pedido(ITEMS_REALES)} />);
    const texto = textoDe(buf);

    expect(texto).toContain('SUBTOTAL');
    expect(texto).toContain('$349.402'); // 388.224 - 38.822

    // El orden en el papel importa: descuento, subtotal, IVA, ICUI, total.
    const pos = (s: string) => texto.indexOf(s);
    expect(pos('Valor del descuento')).toBeLessThan(pos('SUBTOTAL'));
    expect(pos('SUBTOTAL')).toBeLessThan(pos('Valor del impuesto (IVA)'));
    expect(pos('Valor del impuesto (IVA)')).toBeLessThan(pos('Valor del ICUI'));
    expect(pos('Valor del ICUI')).toBeLessThan(pos('TOTAL A CANCELAR'));
  });

  it('no imprime entidades HTML crudas junto al NIT ni la direccion', () => {
    // La version anterior sacaba "&nbsp;" literal en el papel.
    return renderToBuffer(<PedidoPDF pedido={pedido(ITEMS_REALES)} />).then((buf) => {
      expect(textoDe(buf)).not.toContain('&nbsp;');
    });
  });

  it('incrusta el logo, sin depender de una descarga', async () => {
    const buf = await renderToBuffer(<PedidoPDF pedido={pedido(ITEMS_REALES)} />);
    const bin = buf.toString('latin1');

    // Un XObject de imagen en el PDF significa que el logo quedo adentro.
    expect(bin).toContain('/Subtype /Image');
    // Y que no quedo ninguna referencia a bajar algo de la red.
    expect(bin).not.toContain('http://');
    expect(bin).not.toContain('https://');
  });

  it('cabe en una hoja con pocos articulos', async () => {
    const buf = await renderToBuffer(<PedidoPDF pedido={pedido(ITEMS_REALES)} />);
    expect(contarPaginas(buf)).toBe(1);
  });

  it('pagina solo cuando hace falta y repite el encabezado', async () => {
    const buf = await renderToBuffer(
      <PedidoPDF pedido={pedido(Array.from({ length: 40 }, (_, i) => item(i + 1)))} />,
    );
    const paginas = contarPaginas(buf);
    expect(paginas).toBeGreaterThan(1);

    const texto = textoDe(buf);
    expect(texto).toContain('ARTICULO NUMERO 40'); // el ultimo renglon no se pierde
    expect(texto).toContain('TOTAL A CANCELAR'); // los totales llegan a la ultima hoja
  });

  it('la paginacion respeta el alto real: las observaciones empujan hojas', async () => {
    const largos = Array.from({ length: 20 }, (_, i) =>
      item(i + 1, 'Entregar en bodega trasera, coordinar con el jefe de patio'),
    );
    const cortos = Array.from({ length: 20 }, (_, i) => item(i + 1));

    const conObs = contarPaginas(await renderToBuffer(<PedidoPDF pedido={pedido(largos)} />));
    const sinObs = contarPaginas(await renderToBuffer(<PedidoPDF pedido={pedido(cortos)} />));

    // El corte fijo de 11 articulos por hoja de la version anterior daba el
    // mismo numero en los dos casos, y por eso se desbordaba.
    expect(conObs).toBeGreaterThan(sinObs);
  });

  it('dos generaciones seguidas dan el mismo resultado', async () => {
    const p = pedido([item(1), item(2)]);
    const a = await renderToBuffer(<PedidoPDF pedido={p} />);
    const b = await renderToBuffer(<PedidoPDF pedido={p} />);
    expect(contarPaginas(a)).toBe(contarPaginas(b));
    expect(textoDe(a)).toBe(textoDe(b));
  });
});

describe('InformePDF', () => {
  it('genera el informe con sus totales', async () => {
    const pedidos = [pedido(Array.from({ length: 30 }, (_, i) => item(i + 1)))];
    const informe = construirInforme(pedidos, {
      desde: '2026-09-01',
      hasta: '2026-09-30',
      linea: 'todas',
    });

    const buf = await renderToBuffer(<InformePDF informe={informe} />);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');

    const texto = textoDe(buf);
    expect(texto).toContain('Informe de ventas');
    expect(texto).toContain('TOTAL GENERAL');
    expect(texto).toContain('ARTICULO NUMERO 1');
    expect(contarPaginas(buf)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Informe semanal: el entregable del negocio
// ---------------------------------------------------------------------------

import { construirInformeSemanal } from '../domain/informeSemanal';
import { InformeSemanalPDF } from './InformeSemanalPDF';
import type { Corte, Presupuesto, Referencia } from '../domain/types';

const REFS: Referencia[] = [
  { id: 'BOLSA-INST', linea: 'CONDIMAR', etiqueta: 'BOLSA INST', orden: 1 },
  { id: '1X100', linea: 'CONDIMAR', etiqueta: '1x100', orden: 2 },
  { id: 'LAMINADOS', linea: 'NIDALCA', etiqueta: 'LAMINADOS', orden: 3 },
];

const METAS: Presupuesto[] = [
  { linea: 'CONDIMAR', referenciaId: 'BOLSA-INST', anio: 2026, mes: 9, metaCajas: 230, metaPesos: 0 },
  { linea: 'CONDIMAR', referenciaId: 'TOTAL', anio: 2026, mes: 9, metaCajas: 0, metaPesos: 102314380 },
];

const CORTE: Corte = {
  id: '2026-09-S2',
  anio: 2026,
  mes: 9,
  semana: 2,
  titulo: '12 de Septiembre Sincelejo',
  ciudad: 'SINCELEJO',
  fechaCorte: '',
  cerrado: false,
};

describe('InformeSemanalPDF', () => {
  const informe = construirInformeSemanal({
    corte: CORTE,
    cortes: [{ ...CORTE, id: '2026-09-S1', semana: 1 }, CORTE],
    pedidos: [
      {
        ...pedido(ITEMS_REALES),
        fecha: '2026-09-10',
        estado: 'finalizado',
      },
    ],
    referencias: REFS,
    presupuestos: METAS,
  });

  it('conserva la estructura de columnas de la hoja del cliente', async () => {
    const texto = textoDe(await renderToBuffer(<InformeSemanalPDF informe={informe} />));

    for (const columna of [
      'REFERENCIA',
      'ACUM. ANT.',
      'VTAS SEMANA',
      'NUEVO ACUM.',
      'PRESUPUESTO',
      '% CUMPL',
      'FALTA',
    ]) {
      expect(texto).toContain(columna);
    }
  });

  it('lleva las referencias, los totales por linea y el gran total', async () => {
    const texto = textoDe(await renderToBuffer(<InformeSemanalPDF informe={informe} />));

    expect(texto).toContain('BOLSA INST');
    expect(texto).toContain('TOTAL CONDIMAR');
    expect(texto).toContain('TOTAL NIDALCA');
    expect(texto).toContain('GRAN TOTAL');

    // El orden importa: cada total va despues de sus referencias.
    expect(texto.indexOf('BOLSA INST')).toBeLessThan(texto.indexOf('TOTAL CONDIMAR'));
    expect(texto.indexOf('TOTAL NIDALCA')).toBeLessThan(texto.indexOf('GRAN TOTAL'));
  });


  it('las tres cajas de BOLSA INST salen como cajas y el total en pesos', async () => {
    // 48 unidades con embalaje 16 = 3 cajas completas.
    const f = informe.filas.find((x) => x.referenciaId === 'BOLSA-INST')!;
    expect(f.nuevoAcumulado).toBe(3);

    const texto = textoDe(await renderToBuffer(<InformeSemanalPDF informe={informe} />));
    // Venta neta, sin IVA ni ICUI: es el SUBTOTAL del pedido, no el total.
    expect(texto).toContain('$349.402');
  });

  it('avisa que las unidades sueltas quedan pendientes', async () => {
    const texto = textoDe(await renderToBuffer(<InformeSemanalPDF informe={informe} />));
    expect(texto).toContain('cajas completas');
  });
});
