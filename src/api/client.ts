import { uid } from '../domain/formato';
import type {
  Ajuste,
  Cliente,
  Corte,
  Presupuesto,
  Referencia,
  ItemPedido,
  Linea,
  Pedido,
  Producto,
  ProductoCondimar,
  ProductoNidalca,
} from '../domain/types';

const LS_KEY_API = 'pedidos_api_url';

/**
 * URL del Apps Script. Se resuelve en dos niveles: lo que el usuario haya
 * configurado en este dispositivo gana sobre el valor horneado en el build
 * (VITE_API_URL), que existe para que el despliegue funcione sin que nadie
 * tenga que pegar una URL.
 */
export function getApiUrl(): string {
  const local = localStorage.getItem(LS_KEY_API);
  if (local) return local;
  return import.meta.env.VITE_API_URL ?? '';
}

export function setApiUrl(url: string): void {
  localStorage.setItem(LS_KEY_API, url.trim());
}

export function clearApiUrl(): void {
  localStorage.removeItem(LS_KEY_API);
}

export class ApiError extends Error {}

async function apiGet<T>(accion: string, signal?: AbortSignal): Promise<T> {
  const base = getApiUrl();
  if (!base) throw new ApiError('No hay URL de Apps Script configurada.');
  const sep = base.includes('?') ? '&' : '?';
  const res = await fetch(`${base}${sep}accion=${encodeURIComponent(accion)}`, { signal });
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(payload: unknown): Promise<T> {
  const base = getApiUrl();
  if (!base) throw new ApiError('No hay URL de Apps Script configurada.');
  const res = await fetch(base, {
    method: 'POST',
    // text/plain a proposito: evita el preflight CORS, que Apps Script no responde.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`);
  const data = (await res.json()) as T & { error?: string };
  if (data?.error) throw new ApiError(data.error);
  return data;
}

/** Lo que devuelve la hoja, crudo. */
interface CatalogosRaw {
  referencias?: Record<string, unknown>[];
  clientesCondimar?: Record<string, unknown>[];
  clientesNidalca?: Record<string, unknown>[];
  productosCondimar?: Record<string, unknown>[];
  productosNidalca?: Record<string, unknown>[];
}

/**
 * La hoja guarda el IVA de Nidalca como fraccion (0.05) y el de Condimar como
 * porcentaje (19). Adentro siempre se trabaja en porcentaje.
 */
function aPorcentaje(v: unknown): number {
  const n = Number(v) || 0;
  return n > 0 && n < 1 ? n * 100 : n;
}

function normalizarCliente(c: Record<string, unknown>): Cliente {
  /*
   * La hoja normalizada ya trae `nit` y `dv` separados, pero se contempla el
   * formato viejo ("70551145-1") por si alguien pega una fila a mano.
   */
  const crudo = String(c.nit ?? c.nit_a ?? '').trim();
  const [nitPartido, dvPartido = ''] = crudo.split('-');
  const dv = String(c.dv ?? '').trim() || dvPartido;

  return {
    id: String(c.id ?? '').trim(),
    razon_social: String(c.razon_social ?? '').trim(),
    nit: nitPartido.trim(),
    dv: dv.trim(),
    direccion: String(c.direccion ?? '').trim(),
    ciudad: String(c.ciudad ?? '').trim().toUpperCase(),
    telefono: String(c.telefono ?? c.telefonos ?? '').trim(),
    plazo_credito: Number(c.plazo_credito) || 30,
    compro: /^s/i.test(String(c.compro ?? '')),
    // Solo un "NO" explicito desactiva: una celda vacia se toma como activo.
    activo: String(c.activo ?? '').trim().toUpperCase() !== 'NO',
  };
}

/**
 * Los nombres de la hoja no son los del dominio: alli se llaman `iva_pct` e
 * `icui_pct` porque conviven con columnas en pesos, y `referencia_id` porque
 * es una clave foranea. Adentro son `iva`, `icui` y `referenciaId`.
 */
function normalizarProductoCondimar(p: Record<string, unknown>): ProductoCondimar {
  return {
    id: String(p.id ?? '').trim(),
    linea: 'CONDIMAR',
    categoria: String(p.categoria ?? 'General').trim(),
    producto: String(p.producto ?? '').trim(),
    precio: Number(p.precio) || 0,
    iva: aPorcentaje(p.iva_pct ?? p.iva),
    icui: aPorcentaje(p.icui_pct ?? p.icui),
    embalaje: (p.embalaje as number | string) ?? 1,
    referenciaId: String(p.referencia_id ?? '').trim(),
  };
}

function normalizarProductoNidalca(p: Record<string, unknown>): ProductoNidalca {
  return {
    id: String(p.id ?? '').trim(),
    linea: 'NIDALCA',
    categoria: String(p.categoria ?? '').trim(),
    producto: String(p.producto ?? '').trim(),
    precio: Number(p.precio) || 0,
    iva: aPorcentaje(p.iva_pct ?? p.iva),
    referenciaId: String(p.referencia_id ?? '').trim(),
  };
}

export interface Catalogos {
  clientes: Record<Linea, Cliente[]>;
  productos: Record<Linea, Producto[]>;
  referencias: Referencia[];
}

function normalizarReferencia(r: Record<string, unknown>): Referencia {
  return {
    id: String(r.id ?? '').trim(),
    linea: (String(r.linea).toUpperCase() === 'NIDALCA' ? 'NIDALCA' : 'CONDIMAR') as Linea,
    etiqueta: String(r.etiqueta_informe ?? r.etiqueta ?? '').trim(),
    orden: Number(r.orden) || 0,
  };
}

export interface Planeacion {
  cortes: Corte[];
  presupuestos: Presupuesto[];
  ajustes: Ajuste[];
}

const lineaDe = (v: unknown): Linea =>
  String(v).toUpperCase() === 'NIDALCA' ? 'NIDALCA' : 'CONDIMAR';

/** Un ajuste leido de la hoja. Antes de la version 1.8.0 del script no vienen. */
function normalizarAjuste(a: Record<string, unknown>): Ajuste {
  return {
    id: String(a.id ?? '').trim(),
    tipo: String(a.tipo) === 'devolucion' ? 'devolucion' : 'inicial',
    anio: Number(a.anio) || 0,
    mes: Number(a.mes) || 0,
    desde: soloFecha(a.desde),
    hasta: soloFecha(a.hasta),
    linea: lineaDe(a.linea),
    referenciaId: String(a.referencia_id ?? '').trim(),
    valor: Number(a.valor) || 0,
  };
}

export async function fetchPlaneacion(signal?: AbortSignal): Promise<Planeacion> {
  const raw = await apiGet<{
    cortes?: Record<string, unknown>[];
    presupuestos?: Record<string, unknown>[];
    ajustes?: Record<string, unknown>[];
  }>('planeacion', signal);

  return {
    cortes: (raw.cortes ?? []).map((c) => ({
      id: String(c.id ?? ''),
      anio: Number(c.anio) || 0,
      mes: Number(c.mes) || 0,
      semana: Number(c.semana) || 0,
      titulo: String(c.titulo ?? ''),
      ciudad: String(c.ciudad ?? ''),
      fechaCorte: String(c.fecha_corte ?? '').slice(0, 10),
      cerrado: /^s/i.test(String(c.cerrado ?? '')),
    })),
    presupuestos: (raw.presupuestos ?? []).map((p) => ({
      linea: (String(p.linea).toUpperCase() === 'NIDALCA' ? 'NIDALCA' : 'CONDIMAR') as Linea,
      referenciaId: String(p.referencia_id ?? '').trim(),
      anio: Number(p.anio) || 0,
      mes: Number(p.mes) || 0,
      metaCajas: Number(p.meta_cajas) || 0,
      metaPesos: Number(p.meta_pesos) || 0,
    })),
    ajustes: (raw.ajustes ?? []).map(normalizarAjuste),
  };
}

/**
 * Guarda ajustes del Informe por id. Uno en cero se borra de la hoja.
 * La hoja los llama `referencia_id`, como en el resto de las pestañas.
 */
export function guardarAjustes(datos: Ajuste[]) {
  const ahora = new Date().toISOString();
  return apiPost<unknown>({
    accion: 'guardarAjustes',
    datos: datos.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      anio: a.anio,
      mes: a.mes,
      desde: a.desde,
      hasta: a.hasta,
      linea: a.linea,
      referencia_id: a.referenciaId,
      valor: a.valor,
      updated_at: ahora,
    })),
  });
}

/** Reemplaza la pestaña completa: hay que mandar todos los meses, no solo uno. */
export function guardarPresupuestos(datos: Presupuesto[]) {
  return apiPost<unknown>({
    accion: 'guardarPresupuestos',
    datos: datos.map((p) => ({
      linea: p.linea,
      referencia_id: p.referenciaId,
      anio: p.anio,
      mes: p.mes,
      meta_cajas: p.metaCajas || '',
      meta_pesos: p.metaPesos || '',
    })),
  });
}

export function guardarInforme(corteId: string, filas: Record<string, unknown>[]) {
  return apiPost<unknown>({ accion: 'guardarInforme', corte_id: corteId, filas });
}

/**
 * La hoja no guarda a que linea pertenece cada producto: se deduce de la
 * pestania de donde vino. Se etiqueta aqui, en la frontera, para que de este
 * punto hacia adentro el tipo ya sea exacto.
 */
export async function fetchCatalogos(signal?: AbortSignal): Promise<Catalogos> {
  const raw = await apiGet<CatalogosRaw>('catalogos', signal);
  return {
    clientes: {
      CONDIMAR: (raw.clientesCondimar ?? []).map(normalizarCliente),
      NIDALCA: (raw.clientesNidalca ?? []).map(normalizarCliente),
    },
    productos: {
      CONDIMAR: (raw.productosCondimar ?? []).map(normalizarProductoCondimar),
      NIDALCA: (raw.productosNidalca ?? []).map(normalizarProductoNidalca),
    },
    referencias: (raw.referencias ?? []).map(normalizarReferencia),
  };
}

/**
 * Normaliza un item que viene de la hoja.
 *
 * Dos trabajos: etiquetar la linea (los pedidos guardados por la version
 * anterior no la traen en cada renglon) y forzar numeros, porque Sheets
 * devuelve celdas como texto con frecuencia.
 */
function normalizarItem(crudo: Record<string, unknown>, lineaPedido: Linea): ItemPedido {
  const linea = (crudo.linea as Linea) ?? lineaPedido;
  const comun = {
    /*
     * Identidad del renglon en la interfaz. Se usa `||` y no `??` a proposito:
     * la hoja devuelve cadena vacia cuando la celda esta vacia, y `??` solo
     * cae con null o undefined. Dos renglones sin id compartirian lineId y la
     * edicion tocaria el equivocado.
     */
    lineId: String(crudo.lineId || crudo.id || '') || uid(),
    cantidad: Number(crudo.cantidad) || 0,
    descuentoPct: Number(crudo.descuento_pct ?? crudo.descuentoPct) || 0,
    observaciones: String(crudo.observaciones ?? ''),
  };

  if (linea === 'NIDALCA') {
    return { ...comun, ...normalizarProductoNidalca(crudo), linea: 'NIDALCA' };
  }
  return { ...comun, ...normalizarProductoCondimar(crudo), linea: 'CONDIMAR' };
}

/**
 * Fecha civil desde lo que devuelva la hoja.
 *
 * Sheets convierte "2026-09-25" en una celda de fecha, y al serializarla sale
 * como instante ISO con zona horaria. Aca solo interesa el dia.
 */
function soloFecha(v: unknown): string {
  const s = String(v ?? '');
  return s.slice(0, 10);
}

/**
 * Reconstruye un pedido leido de la hoja.
 *
 * Al guardar, el pedido se aplana en columnas (`cliente_id`, `bruto`, `total`…)
 * porque una hoja de calculo no anida. Al leer hay que volver a armarlo, o la
 * interfaz muestra el cliente vacio y el total en cero.
 */
export function normalizarPedido(crudo: Record<string, unknown>): Pedido {
  const linea = (crudo.linea as Linea) ?? 'CONDIMAR';
  const items = (crudo.items as Record<string, unknown>[] | undefined) ?? [];

  const bruto = Number(crudo.bruto) || 0;
  const descuento = Number(crudo.descuento) || 0;
  const iva = Number(crudo.iva) || 0;
  const icui = Number(crudo.icui) || 0;
  // El subtotal se recalcula si la hoja no lo trae: es bruto menos descuento.
  const subtotal = crudo.subtotal === '' || crudo.subtotal === undefined
    ? bruto - descuento
    : Number(crudo.subtotal) || 0;

  return {
    id: String(crudo.id ?? ''),
    numero: (crudo.numero as string | number) ?? '',
    linea,
    cliente: normalizarCliente((crudo.cliente as Record<string, unknown>) ?? {}),
    fecha: soloFecha(crudo.fecha),
    obsGenerales: String(crudo.obs_generales ?? crudo.obsGenerales ?? ''),
    items: items.map((it) => normalizarItem(it, linea)),
    totales: {
      bruto,
      descuento,
      subtotal,
      iva,
      icui,
      total: Number(crudo.total) || subtotal + iva + icui,
    },
    estado: (String(crudo.estado) === 'finalizado' ? 'finalizado' : 'borrador'),
    updatedAt: String(crudo.updated_at ?? crudo.updatedAt ?? ''),
  };
}

export async function fetchPedidos(signal?: AbortSignal): Promise<Pedido[]> {
  const raw = await apiGet<{ pedidos?: Record<string, unknown>[] }>('pedidos', signal);
  return (raw.pedidos ?? []).map(normalizarPedido);
}

export function siguienteNumero(linea: Linea) {
  return apiPost<{ numero: string | number }>({ accion: 'siguienteNumero', linea });
}

export function guardarPedido(pedido: Pedido) {
  return apiPost<unknown>({ accion: 'guardarPedido', pedido });
}

export function eliminarPedido(id: string) {
  return apiPost<unknown>({ accion: 'eliminarPedido', id });
}

/** Una sola llamada para varios: el script recorre la hoja una vez. */
export function eliminarPedidos(ids: string[]) {
  return apiPost<unknown>({ accion: 'eliminarPedidos', ids });
}

/*
 * Al escribir hay que traducir de vuelta a los nombres de la hoja.
 *
 * El script ordena cada fila segun la cabecera de la pestaña, asi que un campo
 * con el nombre del dominio no se reconoce: `compro: true` en vez de "SI", o
 * un `linea` ausente, dejan la celda con un valor que despues no se relee.
 */
export function guardarClientes(linea: Linea, datos: Cliente[]) {
  return apiPost<unknown>({
    accion: 'guardarClientes',
    linea,
    datos: datos.map((c) => ({
      id: c.id,
      linea,
      razon_social: c.razon_social,
      nit: c.nit,
      dv: c.dv,
      direccion: c.direccion,
      ciudad: c.ciudad,
      telefono: c.telefono,
      plazo_credito: c.plazo_credito,
      // La hoja guarda SI/NO: mandar `true` lo releeria como "no compro".
      compro: c.compro ? 'SI' : 'NO',
      activo: c.activo ? 'SI' : 'NO',
    })),
  });
}

/** La hoja no espera el campo `linea` en cada fila: se quita al enviar. */
export function eliminarCliente(id: string) {
  return apiPost<unknown>({ accion: 'eliminarCliente', id });
}

export function guardarProductos(linea: Linea, datos: Producto[]) {
  return apiPost<unknown>({
    accion: 'guardarProductos',
    linea,
    datos: datos.map((p) => ({
      id: p.id,
      linea,
      categoria: p.categoria,
      producto: p.producto,
      precio: p.precio,
      // En la hoja se llaman con sufijo porque conviven con columnas en pesos.
      iva_pct: p.iva,
      icui_pct: p.linea === 'CONDIMAR' ? p.icui : 0,
      embalaje: p.linea === 'CONDIMAR' ? p.embalaje : 1,
      referencia_id: p.referenciaId,
      activo: 'SI',
    })),
  });
}
