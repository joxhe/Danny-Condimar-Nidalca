/**
 * Modelo de dominio.
 *
 * Las dos lineas se modelan como union discriminada por `linea`, pero el eje
 * que las separa ya no es el precio: desde el listado 2025 las dos manejan un
 * precio unico. Lo que las distingue es como llegan al Informe.
 *
 *   Condimar  ->  por referencia de empaque, contando cajas
 *   Nidalca   ->  por categoria del listado
 *
 * El compilador obliga a manejar ambos casos en cada punto donde eso importa.
 */

export type Linea = 'CONDIMAR' | 'NIDALCA';
export type EstadoPedido = 'borrador' | 'finalizado';

export interface Empresa {
  nombre: string;
  nit: string;
  direccion: string;
  telefono: string;
  email: string;
}

export interface Cliente {
  /** Id estable de la hoja (CC-001, CN-001). Es lo que permite el upsert. */
  id: string;
  razon_social: string;
  /** NIT o cedula, sin digito de verificacion. */
  nit: string;
  /** Digito de verificacion, cuando el cliente lo tiene. */
  dv: string;
  direccion: string;
  ciudad: string;
  telefono: string;
  plazo_credito: number;
  /** La hoja del cliente marca quien compro en el periodo. */
  compro: boolean;
}

interface ProductoBase {
  /** Id estable de la hoja (PC-001, PN-001). */
  id: string;
  categoria: string;
  producto: string;
  precio: number;
  /** Porcentaje, no fraccion: 19 y no 0.19. Se normaliza al leer la hoja. */
  iva: number;
}

/**
 * Condimar. Aporta las dos columnas que alimentan el Informe: cuantas unidades
 * entran en una caja, y a que fila del informe pertenece esa caja.
 */
export interface ProductoCondimar extends ProductoBase {
  linea: 'CONDIMAR';
  icui: number;
  /** Unidades por caja. Puede ser "KILO" en los articulos a granel. */
  embalaje: number | string;
  /** Fila del Informe a la que suma: id de la tabla `referencias`. */
  referenciaId: string;
}

/**
 * Nidalca. Entra al Informe agrupado por categoria, y la hoja ya resuelve a
 * que fila corresponde cada categoria.
 */
export interface ProductoNidalca extends ProductoBase {
  linea: 'NIDALCA';
  referenciaId: string;
}

export type Producto = ProductoCondimar | ProductoNidalca;

/** Un articulo dentro de un pedido: el producto congelado + lo que se pidio. */
export type ItemPedido = Producto & {
  /** Identidad de la fila en la UI. No es clave de negocio. */
  lineId: string;
  cantidad: number;
  descuentoPct: number;
  observaciones: string;
};

export interface Totales {
  bruto: number;
  descuento: number;
  /** Bruto menos descuento. Es la base sobre la que se liquidan IVA e ICUI. */
  subtotal: number;
  iva: number;
  icui: number;
  total: number;
}

export interface Pedido {
  id: string;
  numero: string | number;
  linea: Linea;
  cliente: Cliente;
  fecha: string;
  items: ItemPedido[];
  obsGenerales: string;
  totales: Totales;
  estado: EstadoPedido;
  updatedAt: string;
}

export const EMPRESAS: Record<Linea, Empresa> = {
  CONDIMAR: {
    nombre: 'Condimar S.A.S',
    nit: '890.113.075-7',
    direccion: 'Clle 110 No 4-100',
    telefono: '320 540 36 41',
    email: 'facturacion@condimar.co',
  },
  NIDALCA: {
    nombre: 'Nidalca S.A.',
    nit: '802.024.512-2',
    direccion: 'Clle 110 No 4-100',
    telefono: '320 540 36 41',
    email: 'facturacion@condimar.co',
  },
};

export const CLIENTE_VACIO: Cliente = {
  id: '',
  razon_social: '',
  nit: '',
  dv: '',
  direccion: '',
  ciudad: '',
  telefono: '',
  plazo_credito: 30,
  compro: false,
};

// ---------------------------------------------------------------------------
// Informe semanal
// ---------------------------------------------------------------------------

/** Fila del Informe: un tipo de empaque para Condimar, una categoria en Nidalca. */
export interface Referencia {
  id: string;
  linea: Linea;
  /** Como se escribe en la hoja del cliente: "50x50", "BOLSA INST". */
  etiqueta: string;
  orden: number;
}

/** Meta del mes. En cajas por referencia, en pesos para el total de la linea. */
export interface Presupuesto {
  linea: Linea;
  /** Id de referencia, o "TOTAL" para la meta en pesos de la linea. */
  referenciaId: string;
  anio: number;
  mes: number;
  metaCajas: number;
  metaPesos: number;
}

/** Corte semanal. El cliente los arma los sabados. */
export interface Corte {
  id: string;
  anio: number;
  mes: number;
  semana: number;
  /** "5 de Septiembre MONTERIA" */
  titulo: string;
  ciudad: string;
  /** Ultimo dia que entra al corte. Si falta, se reparte el mes en semanas. */
  fechaCorte: string;
  cerrado: boolean;
}

