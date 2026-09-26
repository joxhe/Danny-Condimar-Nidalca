import Dexie, { type EntityTable } from 'dexie';
import type { Catalogos } from '../api/client';
import type { Pedido } from '../domain/types';

/**
 * Cache local en IndexedDB.
 *
 * Reemplaza al localStorage de la version anterior, que tope en 5 MB y bloquea
 * el hilo principal al serializar. Aqui los pedidos quedan ademas indexados,
 * asi que los informes se pueden calcular sin conexion.
 */
interface RegistroKV {
  key: string;
  value: unknown;
}

const db = new Dexie('pedidos-condimar') as Dexie & {
  kv: EntityTable<RegistroKV, 'key'>;
  pedidos: EntityTable<Pedido, 'id'>;
};

db.version(1).stores({
  kv: 'key',
  pedidos: 'id, estado, linea, fecha, updatedAt',
});

const K_CATALOGOS = 'catalogos';
const K_SYNC = 'ultimaSincronizacion';

export async function guardarCatalogosLocal(c: Catalogos): Promise<void> {
  await db.kv.bulkPut([
    { key: K_CATALOGOS, value: c },
    { key: K_SYNC, value: new Date().toISOString() },
  ]);
}

export async function leerCatalogosLocal(): Promise<Catalogos | null> {
  const row = await db.kv.get(K_CATALOGOS);
  return (row?.value as Catalogos) ?? null;
}

export async function leerUltimaSincronizacion(): Promise<string | null> {
  const row = await db.kv.get(K_SYNC);
  return (row?.value as string) ?? null;
}

export async function guardarPedidosLocal(pedidos: Pedido[]): Promise<void> {
  await db.transaction('rw', db.pedidos, async () => {
    await db.pedidos.clear();
    await db.pedidos.bulkPut(pedidos);
  });
}

export async function upsertPedidoLocal(pedido: Pedido): Promise<void> {
  await db.pedidos.put(pedido);
}

export async function borrarPedidoLocal(id: string): Promise<void> {
  await db.pedidos.delete(id);
}

export async function leerPedidosLocal(): Promise<Pedido[]> {
  return db.pedidos.toArray();
}

export { db };
