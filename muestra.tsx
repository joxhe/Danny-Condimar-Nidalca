import { renderToFile } from '@react-pdf/renderer';
import { computeTotales } from './src/domain';
import type { ItemPedido, Pedido } from './src/domain/types';
import { PedidoPDF } from './src/pdf/PedidoPDF';

/** Genera un PDF de muestra con el pedido No. 5 real, para revisar el formato. */
const base = {
  linea: 'CONDIMAR' as const,
  categoria: 'General',
  referenciaId: 'BOLSA-INST',
  iva: 19,
  icui: 20,
  embalaje: 16,
  cantidad: 16,
  descuentoPct: 10,
  observaciones: '',
};

const items: ItemPedido[] = [
  { ...base, id: 'PC-018', lineId: '1', producto: 'COLOR X 500', precio: 5063 },
  { ...base, id: 'PC-019', lineId: '2', producto: 'COMINO X 500', precio: 13638 },
  { ...base, id: 'PC-020', lineId: '3', producto: 'PIMIENTA MOL X 500', precio: 5563 },
];

const pedido: Pedido = {
  id: 'p5',
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
  updatedAt: new Date().toISOString(),
};

await renderToFile(<PedidoPDF pedido={pedido} />, 'muestra-pedido-5.pdf');
console.log('listo');
