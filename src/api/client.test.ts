import { describe, expect, it } from 'vitest';
import { normalizarPedido } from './client';

/**
 * La fila tal como vuelve de la hoja de calculo: plana, con nombres de
 * columna, la fecha convertida en instante y el cliente ya unido por el script.
 */
const FILA_DE_LA_HOJA = {
  id: 'PRUEBA-DIAG',
  numero: 999,
  linea: 'CONDIMAR',
  cliente_id: 'CC-009',
  fecha: '2026-09-25T07:00:00.000Z',
  corte_id: '',
  estado: 'borrador',
  obs_generales: 'prueba',
  bruto: 100,
  descuento: 10,
  subtotal: 90,
  iva: 17.1,
  icui: 18,
  total: 125.1,
  updated_at: '2026-09-25T14:00:00.000Z',
  cliente: {
    id: 'CC-009',
    razon_social: 'GIL DE RINCON MARTHA F.',
    nit: '34971271',
    dv: '',
    direccion: 'CRA. 14 NO. 9-32',
    ciudad: 'CERETE',
    telefono: '7746138',
    plazo_credito: 30,
    compro: 'NO',
  },
  items: [
    {
      id: 'PRUEBA-DIAG-1',
      pedido_id: 'PRUEBA-DIAG',
      producto_id: 'PC-018',
      producto: 'COLOR X 500',
      categoria: 'General',
      referencia_id: 'BOLSA-INST',
      precio: 5063,
      iva_pct: 19,
      icui_pct: 20,
      embalaje: 16,
      cantidad: 16,
      descuento_pct: 10,
      observaciones: '',
    },
  ],
};

describe('normalizarPedido', () => {
  it('vuelve a armar el cliente, que en la hoja es solo un id', () => {
    const p = normalizarPedido(FILA_DE_LA_HOJA);
    expect(p.cliente.razon_social).toBe('GIL DE RINCON MARTHA F.');
    expect(p.cliente.ciudad).toBe('CERETE');
    expect(p.cliente.telefono).toBe('7746138');
  });

  it('vuelve a armar los totales, que en la hoja son columnas sueltas', () => {
    const p = normalizarPedido(FILA_DE_LA_HOJA);
    expect(p.totales).toEqual({
      bruto: 100,
      descuento: 10,
      subtotal: 90,
      iva: 17.1,
      icui: 18,
      total: 125.1,
    });
  });

  it('recorta la fecha al dia', () => {
    // Sheets convierte "2026-09-25" en fecha y la devuelve como instante ISO.
    // Sin recortar, fmtDate partia por los guiones y daba "25T07:00:00.000Z/09/2026".
    expect(normalizarPedido(FILA_DE_LA_HOJA).fecha).toBe('2026-09-25');
  });

  it('traduce los nombres de columna de los renglones', () => {
    const [it] = normalizarPedido(FILA_DE_LA_HOJA).items;
    expect(it.producto).toBe('COLOR X 500');
    expect(it.cantidad).toBe(16);
    expect(it.descuentoPct).toBe(10); // descuento_pct en la hoja
    expect(it.iva).toBe(19); //           iva_pct en la hoja
    if (it.linea === 'CONDIMAR') {
      expect(it.icui).toBe(20); //        icui_pct en la hoja
      expect(it.embalaje).toBe(16);
      expect(it.referenciaId).toBe('BOLSA-INST');
    }
  });

  it('cada renglon queda con identidad propia para la interfaz', () => {
    const items = normalizarPedido({
      ...FILA_DE_LA_HOJA,
      items: [FILA_DE_LA_HOJA.items[0], { ...FILA_DE_LA_HOJA.items[0], id: '' }],
    }).items;
    expect(items[0].lineId).toBeTruthy();
    expect(items[1].lineId).toBeTruthy();
    expect(items[0].lineId).not.toBe(items[1].lineId);
  });

  it('calcula el subtotal si la hoja no lo trae', () => {
    const p = normalizarPedido({ ...FILA_DE_LA_HOJA, subtotal: '' });
    expect(p.totales.subtotal).toBe(90);
  });

  it('un pedido sin cliente no rompe la pantalla', () => {
    const p = normalizarPedido({ ...FILA_DE_LA_HOJA, cliente: null });
    expect(p.cliente.razon_social).toBe('');
    expect(p.totales.total).toBe(125.1);
  });
});
