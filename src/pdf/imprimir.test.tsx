import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { computeTotales } from '../domain';
import type { ItemPedido, Pedido } from '../domain/types';
import { imponerDosPorHoja } from './imponer';
import { MEDIA_CARTA_HORIZONTAL } from './formatos';
import { PedidoPDF, PedidosPDF } from './PedidoPDF';

// --- Andamiaje -------------------------------------------------------------

function item(n: number, observaciones = ''): ItemPedido {
  return {
    linea: 'CONDIMAR',
    id: `PC-${n}`,
    lineId: `l${n}`,
    categoria: 'General',
    producto: `ARTICULO ${n}`,
    precio: 1000,
    iva: 19,
    icui: 0,
    embalaje: 100,
    referenciaId: '1X100',
    cantidad: 10,
    descuentoPct: 0,
    observaciones,
  };
}

function pedido(numero: number, items: ItemPedido[]): Pedido {
  return {
    id: `p${numero}`,
    numero,
    linea: 'CONDIMAR',
    cliente: {
      id: 'CC-001',
      razon_social: `CLIENTE ${numero}`,
      nit: '123',
      dv: '',
      direccion: 'CRA 1',
      ciudad: 'SINCELEJO',
      telefono: '300',
      plazo_credito: 30,
      compro: true,
      activo: true,
    },
    fecha: '2026-10-06',
    items,
    obsGenerales: '',
    totales: computeTotales(items),
    estado: 'finalizado',
    updatedAt: '2026-10-06T10:00:00.000Z',
  };
}

const corto = (n: number) => pedido(n, [item(1), item(2), item(3)]);

async function tamanos(buf: Uint8Array | Buffer) {
  const doc = await PDFDocument.load(buf);
  return doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return [Math.round(width), Math.round(height)];
  });
}

/** Texto visible: streams inflados y cadenas hexadecimales decodificadas. */
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
    .map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1'))
    .join('');
}

// --- Formato del pedido ----------------------------------------------------

describe('pedido en media carta horizontal', () => {
  it('mide 612 x 396 puntos: la mitad exacta de una carta', async () => {
    const buf = await renderToBuffer(<PedidoPDF pedido={corto(1)} />);
    expect(await tamanos(buf)).toEqual([MEDIA_CARTA_HORIZONTAL]);
  });

  it('un pedido corto cabe en una sola media hoja', async () => {
    const buf = await renderToBuffer(<PedidoPDF pedido={corto(1)} />);
    expect((await tamanos(buf)).length).toBe(1);
  });

  it('un pedido largo sigue en otra media hoja, sin perder renglones', async () => {
    const largo = pedido(9, Array.from({ length: 40 }, (_, i) => item(i + 1)));
    const buf = await renderToBuffer(<PedidoPDF pedido={largo} />);
    const paginas = (await tamanos(buf)).length;

    expect(paginas).toBeGreaterThan(1);
    const texto = textoDe(buf);
    expect(texto).toContain('ARTICULO 40');
    expect(texto).toContain('TOTAL A CANCELAR');
    expect(texto).toContain(`Pag. ${paginas}/${paginas}`);
  });
});

// --- Varios pedidos --------------------------------------------------------

describe('varios pedidos en un documento', () => {
  it('cada uno numera sus propias hojas, no las del documento', async () => {
    // Sin subPageNumber el tercer pedido diria "Pag. 3/5" y no "Pag. 1/1".
    const buf = await renderToBuffer(
      <PedidosPDF pedidos={[corto(1), corto(2), corto(3), corto(4), corto(5)]} />,
    );
    const texto = textoDe(buf);
    expect(texto.split('Pag. 1/1').length - 1).toBe(5);
    expect(texto).not.toContain('Pag. 3/5');
  });

  it('cada pedido empieza en su propia media hoja', async () => {
    const buf = await renderToBuffer(<PedidosPDF pedidos={[corto(1), corto(2), corto(3)]} />);
    expect((await tamanos(buf)).length).toBe(3);
  });
});

// --- Imposicion ------------------------------------------------------------

describe('dos medias cartas por hoja carta', () => {
  it('cinco pedidos cortos salen en tres hojas carta', async () => {
    const medias = await renderToBuffer(
      <PedidosPDF pedidos={[corto(1), corto(2), corto(3), corto(4), corto(5)]} />,
    );
    const hojas = await imponerDosPorHoja(medias);

    expect(await tamanos(hojas)).toEqual([
      [612, 792],
      [612, 792],
      [612, 792],
    ]);
  });

  it('una cantidad par llena las hojas sin dejar mitades vacias', async () => {
    const medias = await renderToBuffer(
      <PedidosPDF pedidos={[corto(1), corto(2), corto(3), corto(4)]} />,
    );
    expect((await tamanos(await imponerDosPorHoja(medias))).length).toBe(2);
  });

  it('un pedido solo ocupa una hoja, en la mitad de arriba', async () => {
    const medias = await renderToBuffer(<PedidosPDF pedidos={[corto(1)]} />);
    expect(await tamanos(await imponerDosPorHoja(medias))).toEqual([[612, 792]]);
  });

  it('no se pierde contenido al acomodar', async () => {
    const medias = await renderToBuffer(<PedidosPDF pedidos={[corto(7), corto(8)]} />);
    const texto = textoDe(Buffer.from(await imponerDosPorHoja(medias)));
    expect(texto).toContain('CLIENTE 7');
    expect(texto).toContain('CLIENTE 8');
    expect(texto).toContain('PEDIDO No. 7');
    expect(texto).toContain('PEDIDO No. 8');
  });
});
