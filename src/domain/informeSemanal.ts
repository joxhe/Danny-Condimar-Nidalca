import { ajustesDeFila } from './ajustes';
import { unidadesACajas } from './cajas';
import { idPeriodo, tituloPeriodo, type Periodo } from './periodos';
import { calcularLinea } from './totales';
import type {
  Ajuste,
  Linea,
  Pedido,
  Presupuesto,
  Referencia,
} from './types';

/**
 * El Informe semanal.
 *
 * Reproduce la tabla que el cliente ya usa:
 *
 *   REFERENCIA | ACUM. ANTERIOR | VENTAS SEMANA | NUEVO ACUMULADO | PRESUPUESTO | % CUMPL | FALTA
 *
 * Con una particularidad que viene de la hoja original y se conserva: las
 * filas de referencia van en CAJAS y las de total en PESOS. Por eso cada fila
 * declara su unidad: son dos magnitudes en la misma columna.
 *
 * El bloque de AÑO ANTERIOR y MES ANTERIOR que traia la hoja se descarto: no
 * hay historia de 2025 de donde sacarlo y el cliente no lo necesita.
 *
 * Se agrega DEVOLUCIONES despues de VENTAS SEMANA, y los dos acumulados se
 * pueden corregir a mano (ver `ajustes.ts`). Siempre se cumple:
 *
 *   NUEVO ACUMULADO = ACUM. ANTERIOR + VENTAS SEMANA - DEVOLUCIONES
 */

export type UnidadInforme = 'cajas' | 'pesos';

export interface FilaInforme {
  referenciaId: string;
  etiqueta: string;
  linea: Linea;
  unidad: UnidadInforme;
  acumAnterior: number;
  ventasSemana: number;
  /** Las registradas en este periodo. Las anteriores ya restan del acumulado. */
  devoluciones: number;
  nuevoAcumulado: number;
  /** Parte del acumulado anterior escrita a mano: ventas fuera de la app. */
  ajusteInicial: number;
  presupuesto: number;
  /** Null cuando no hay meta: dividir por cero no es cero por ciento. */
  pctCumplimiento: number | null;
  falta: number;
  /** Las filas de total llevan otro peso visual. */
  esTotal: boolean;
}

export interface InformeSemanal {
  desde: string;
  hasta: string;
  /** "del 7 al 12 de septiembre de 2026" */
  titulo: string;
  filas: FilaInforme[];
  granTotal: FilaInforme;
  pedidosContados: number;
}

// ---------------------------------------------------------------------------
// Armado
// ---------------------------------------------------------------------------

interface Entradas {
  /** Dentro de un mismo mes: lo garantiza el calendario. */
  periodo: Periodo;
  pedidos: Pedido[];
  referencias: Referencia[];
  presupuestos: Presupuesto[];
  ajustes?: Ajuste[];
}

/** Unidades de un producto: antes del periodo y hasta su ultimo dia. */
interface Acumulado {
  referenciaId: string;
  embalaje: number | string;
  antes: number;
  hasta: number;
}

export function construirInformeSemanal(e: Entradas): InformeSemanal {
  const { desde, hasta } = e.periodo;
  const anio = Number(hasta.slice(0, 4));
  const mes = Number(hasta.slice(5, 7));
  /*
   * El acumulado arranca el dia 1 del mes, no el primer dia del periodo: lo
   * vendido antes entra al ACUM. ANTERIOR. Con el periodo del 14 al 19, lo
   * del 1 al 12 es el acumulado anterior.
   */
  const inicioMes = `${hasta.slice(0, 8)}01`;

  // Solo cuentan los pedidos finalizados: un borrador no es una venta.
  const delMes = e.pedidos.filter(
    (p) => p.estado === 'finalizado' && p.fecha >= inicioMes && p.fecha <= hasta,
  );

  /*
   * Las unidades se acumulan POR PRODUCTO, no por referencia.
   *
   * Una caja contiene unidades de un solo articulo, asi que juntar las 30 de
   * un producto con las 40 de otro para formar una caja de 100 seria inventar
   * una caja que nadie despacho.
   */
  const porProducto = new Map<string, Acumulado>();

  for (const pedido of delMes) {
    const enElPeriodo = pedido.fecha >= desde;

    for (const item of pedido.items) {
      const referenciaId = item.referenciaId;
      if (!referenciaId) continue;

      const clave = `${referenciaId}\u0001${item.producto}`;
      const acc =
        porProducto.get(clave) ??
        ({
          referenciaId,
          embalaje: item.linea === 'CONDIMAR' ? item.embalaje : 1,
          antes: 0,
          hasta: 0,
        } satisfies Acumulado);

      const unidades = Number(item.cantidad) || 0;
      acc.hasta += unidades;
      if (!enElPeriodo) acc.antes += unidades;
      porProducto.set(clave, acc);
    }
  }

  /*
   * Recien ahora se convierte a cajas, y por separado para cada momento.
   *
   * `ventasSemana` es la DIFERENCIA entre los dos acumulados, no las cajas de
   * las unidades del periodo. Esa distincion es la que hace que 30 unidades
   * de una semana se junten con 80 de la siguiente y recien ahi sumen la caja.
   */
  const cajasPorReferencia = new Map<string, { antes: number; hasta: number }>();

  for (const acc of porProducto.values()) {
    const antes = unidadesACajas(acc.antes, acc.embalaje).cajas;
    const hastaCajas = unidadesACajas(acc.hasta, acc.embalaje).cajas;
    const actual = cajasPorReferencia.get(acc.referenciaId) ?? { antes: 0, hasta: 0 };
    actual.antes += antes;
    actual.hasta += hastaCajas;
    cajasPorReferencia.set(acc.referenciaId, actual);
  }

  const ajuste = (linea: Linea, referenciaId: string) =>
    ajustesDeFila(e.ajustes ?? [], e.periodo, linea, referenciaId);

  const metaDe = (linea: Linea, referenciaId: string) =>
    e.presupuestos.find(
      (p) =>
        p.linea === linea &&
        p.referenciaId === referenciaId &&
        p.anio === anio &&
        p.mes === mes,
    );

  // --- Filas de referencia, en cajas ---
  const ordenadas = [...e.referencias].sort(
    (a, b) => a.linea.localeCompare(b.linea) || a.orden - b.orden,
  );

  const filas: FilaInforme[] = [];

  for (const linea of ['CONDIMAR', 'NIDALCA'] as const) {
    for (const ref of ordenadas.filter((r) => r.linea === linea)) {
      const cajas = cajasPorReferencia.get(ref.id) ?? { antes: 0, hasta: 0 };
      const a = ajuste(linea, ref.id);
      filas.push(
        armarFila({
          referenciaId: ref.id,
          etiqueta: ref.etiqueta,
          linea,
          unidad: 'cajas',
          acumAnterior: cajas.antes + a.inicial - a.devolucionesAntes,
          ventasSemana: cajas.hasta - cajas.antes,
          devoluciones: a.devolucionesPeriodo,
          ajusteInicial: a.inicial,
          presupuesto: metaDe(linea, ref.id)?.metaCajas ?? 0,
          esTotal: false,
        }),
      );
    }

    // --- Total de la linea, en pesos ---
    const dinero = totalEnPesos(delMes, linea, desde);
    const a = ajuste(linea, 'TOTAL');
    filas.push(
      armarFila({
        referenciaId: 'TOTAL',
        etiqueta: `TOTAL ${linea}`,
        linea,
        unidad: 'pesos',
        acumAnterior: dinero.antes + a.inicial - a.devolucionesAntes,
        ventasSemana: dinero.hasta - dinero.antes,
        devoluciones: a.devolucionesPeriodo,
        ajusteInicial: a.inicial,
        presupuesto: metaDe(linea, 'TOTAL')?.metaPesos ?? 0,
        esTotal: true,
      }),
    );
  }

  // --- Gran total ---
  const totales = filas.filter((f) => f.esTotal);
  const granTotal = armarFila({
    referenciaId: 'GRAN_TOTAL',
    etiqueta: 'GRAN TOTAL',
    linea: 'CONDIMAR',
    unidad: 'pesos',
    acumAnterior: sumar(totales, 'acumAnterior'),
    ventasSemana: sumar(totales, 'ventasSemana'),
    devoluciones: sumar(totales, 'devoluciones'),
    ajusteInicial: sumar(totales, 'ajusteInicial'),
    presupuesto: sumar(totales, 'presupuesto'),
    esTotal: true,
  });

  return {
    desde,
    hasta,
    titulo: tituloPeriodo(e.periodo),
    filas,
    granTotal,
    pedidosContados: delMes.filter((p) => p.fecha >= desde).length,
  };
}

function armarFila(
  base: Omit<FilaInforme, 'nuevoAcumulado' | 'pctCumplimiento' | 'falta'>,
): FilaInforme {
  const nuevoAcumulado = base.acumAnterior + base.ventasSemana - base.devoluciones;
  return {
    ...base,
    nuevoAcumulado,
    // Sin meta no hay porcentaje. Poner 0% diria que no se cumplio, y lo
    // cierto es que no hay contra que medir.
    pctCumplimiento: base.presupuesto > 0 ? nuevoAcumulado / base.presupuesto : null,
    falta: base.presupuesto - nuevoAcumulado,
  };
}

function sumar(filas: FilaInforme[], campo: keyof FilaInforme): number {
  return filas.reduce((s, f) => s + (Number(f[campo]) || 0), 0);
}

/**
 * Venta neta de una linea, antes del periodo y hasta su ultimo dia.
 *
 * Neta quiere decir SIN IVA NI ICUI: bruto menos descuento, y nada mas. El
 * impuesto no es ingreso del negocio, se recauda para el Estado, asi que
 * sumarlo inflaria el cumplimiento contra un presupuesto que esta en neto.
 *
 * Es la misma base sobre la que se liquidan los impuestos en el pedido, o sea
 * el SUBTOTAL que aparece impreso en el documento.
 */
function totalEnPesos(pedidos: Pedido[], linea: Linea, desde: string) {
  let antes = 0;
  let hasta = 0;

  for (const p of pedidos) {
    if (p.linea !== linea) continue;
    // Se recalcula desde los renglones en vez de confiar en la cabecera
    // guardada: si un precio cambio, el pedido emitido manda.
    const neto = p.items.reduce((s, it) => s + calcularLinea(it).base, 0);
    hasta += neto;
    if (p.fecha < desde) antes += neto;
  }

  return { antes, hasta };
}

/** Las filas tal como se guardan en la pestaña `informe` de la hoja. */
export function informeAFilasDeHoja(informe: InformeSemanal): Record<string, unknown>[] {
  return [...informe.filas, informe.granTotal].map((f, i) => ({
    corte_id: idPeriodo(informe),
    linea: f.linea,
    orden: i + 1,
    referencia_id: f.referenciaId,
    referencia: f.etiqueta,
    unidad: f.unidad,
    acum_anterior: f.acumAnterior,
    ventas_semana: f.ventasSemana,
    devoluciones: f.devoluciones,
    nuevo_acumulado: f.nuevoAcumulado,
    presupuesto: f.presupuesto,
    pct_cumplimiento: f.pctCumplimiento ?? '',
    falta: f.falta,
  }));
}
