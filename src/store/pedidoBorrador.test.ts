import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductoCondimar } from '../domain/types';

/*
 * El borrador se persiste en localStorage. En Node no existe, asi que se
 * reemplaza por uno en memoria antes de cargar el store.
 */
const memoria = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => memoria.set(k, v),
  removeItem: (k: string) => memoria.delete(k),
});

const { usePedidoBorrador } = await import('./pedidoBorrador');

function producto(nombre: string): ProductoCondimar {
  return {
    id: nombre,
    linea: 'CONDIMAR',
    categoria: 'General',
    producto: nombre,
    precio: 1000,
    iva: 19,
    icui: 0,
    embalaje: 100,
    referenciaId: '1X100',
  };
}

beforeEach(() => usePedidoBorrador.getState().limpiar());

describe('agregar articulos al pedido', () => {
  it('el ultimo agregado queda primero, junto al buscador', () => {
    const b = usePedidoBorrador.getState();
    b.agregarProducto(producto('PIMIENTA'));
    b.agregarProducto(producto('COMINO'));
    b.agregarProducto(producto('OREGANO'));

    expect(usePedidoBorrador.getState().items.map((i) => i.producto)).toEqual([
      'OREGANO',
      'COMINO',
      'PIMIENTA',
    ]);
  });

  it('devuelve el id del renglon nuevo, para poder enfocar su cantidad', () => {
    const lineId = usePedidoBorrador.getState().agregarProducto(producto('CLAVOS'));
    const primero = usePedidoBorrador.getState().items[0];
    expect(primero.lineId).toBe(lineId);
    expect(primero.producto).toBe('CLAVOS');
  });

  it('cada renglon recibe su propio id, aunque sea el mismo articulo dos veces', () => {
    const b = usePedidoBorrador.getState();
    const a = b.agregarProducto(producto('LAUREL'));
    const c = b.agregarProducto(producto('LAUREL'));
    expect(a).not.toBe(c);
  });

  it('empieza con cantidad 1 y sin descuento', () => {
    usePedidoBorrador.getState().agregarProducto(producto('CANELA'));
    const [r] = usePedidoBorrador.getState().items;
    expect(r.cantidad).toBe(1);
    expect(r.descuentoPct).toBe(0);
  });
});

describe('identidad del pedido al guardar', () => {
  it('guardar dos veces el mismo pedido nuevo usa el mismo id', () => {
    // Asi se crearon N2 y N4 duplicados: borrador guardado, cliente cambiado,
    // finalizado. Cada guardado inventaba un id y la hoja agregaba otra fila.
    const b = usePedidoBorrador.getState();
    b.agregarProducto(producto('PIMIENTA'));
    b.asegurarId();
    b.setNumero(2);

    const borrador = usePedidoBorrador.getState().construir('borrador', 2);
    const finalizado = usePedidoBorrador.getState().construir('finalizado', 2);

    expect(finalizado.id).toBe(borrador.id);
  });

  it('asegurarId no cambia un id que ya existe', () => {
    const b = usePedidoBorrador.getState();
    const primero = b.asegurarId();
    expect(usePedidoBorrador.getState().asegurarId()).toBe(primero);
  });

  it('un pedido nuevo despues de limpiar recibe otro id', () => {
    const primero = usePedidoBorrador.getState().asegurarId();
    usePedidoBorrador.getState().limpiar();
    expect(usePedidoBorrador.getState().asegurarId()).not.toBe(primero);
  });
});
