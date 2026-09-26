import { unidadesACajas } from './cajas';
import { calcularLinea } from './totales';
import type {
  Corte,
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
 */

export type UnidadInforme = 'cajas' | 'pesos';

export interface FilaInforme {
  referenciaId: string;
  etiqueta: string;
  linea: Linea;
  unidad: UnidadInforme;
  acumAnterior: number;
  ventasSemana: number;
  nuevoAcumulado: number;
  presupuesto: number;
  /** Null cuando no hay meta: dividir por cero no es cero por ciento. */
  pctCumplimiento: number | null;
  falta: number;
  /** Las filas de total llevan otro peso visual. */
  esTotal: boolean;
}

export interface InformeSemanal {
  corte: Corte;
  desde: string;
  hasta: string;
  filas: FilaInforme[];
  granTotal: FilaInforme;
  pedidosContados: number;
}

// ---------------------------------------------------------------------------
// Rango de fechas del corte
// ---------------------------------------------------------------------------

const dosDigitos = (n: number) => String(n).padStart(2, '0');

function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

/**
 * Desde y hasta de un corte.
 *
 * Si la hoja trae `fecha_corte`, el corte termina ahi y empieza el dia
 * siguiente al corte anterior. Si no la trae, el mes se reparte en semanas de
 * siete dias y la ultima se estira hasta fin de mes.
 */
export function rangoDelCorte(corte: Corte, todos: Corte[]): { desde: string; hasta: string } {
  const delMes = todos
    .filter((c) => c.anio === corte.anio && c.mes === corte.mes)
    .sort((a, b) => a.semana - b.semana);

  const ultimo = ultimoDiaDelMes(corte.anio, corte.mes);
  const iso = (dia: number) =>
    `${corte.anio}-${dosDigitos(corte.mes)}-${dosDigitos(Math.min(dia, ultimo))}`;

  const finDe = (c: Corte): string => {
    if (c.fechaCorte) return c.fechaCorte;
    const esUltima = c.semana >= delMes.length;
    return iso(esUltima ? ultimo : c.semana * 7);
  };

  const anterior = delMes.filter((c) => c.semana < corte.semana).pop();
  const hasta = finDe(corte);

  if (!anterior) return { desde: iso(1), hasta };

  // El dia siguiente al cierre anterior, sin pasarse de mes.
  const finAnterior = new Date(finDe(anterior) + 'T12:00:00');
  finAnterior.setDate(finAnterior.getDate() + 1);
  const desde = finAnterior.toISOString().slice(0, 10);

  return { desde: desde > hasta ? hasta : desde, hasta };
}

// ---------------------------------------------------------------------------
// Armado
// ---------------------------------------------------------------------------

interface Entradas {
  corte: Corte;
  cortes: Corte[];
  pedidos: Pedido[];
  referencias: Referencia[];
  presupuestos: Presupuesto[];
}

/** Unidades de un producto, separadas en "antes del corte" y "hasta el corte". */
interface Acumulado {
  referenciaId: string;
  embalaje: number | string;
  antes: number;
  hasta: number;
}

export function construirInformeSemanal(e: Entradas): InformeSemanal {
  const { desde, hasta } = rangoDelCorte(e.corte, e.cortes);
  const inicioMes = `${e.corte.anio}-${dosDigitos(e.corte.mes)}-01`;

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
    const enLaSemana = pedido.fecha >= desde;

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
      if (!enLaSemana) acc.antes += unidades;
      porProducto.set(clave, acc);
    }
  }

  /*
   * Recien ahora se convierte a cajas, y por separado para cada momento.
   *
   * `ventasSemana` es la DIFERENCIA entre los dos acumulados, no las cajas de
   * las unidades de la semana. Esa distincion es la que hace que 30 unidades
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

  const metaDe = (linea: Linea, referenciaId: string) =>
    e.presupuestos.find(
      (p) =>
        p.linea === linea &&
        p.referenciaId === referenciaId &&
        p.anio === e.corte.anio &&
        p.mes === e.corte.mes,
    );

  // --- Filas de referencia, en cajas ---
  const ordenadas = [...e.referencias].sort(
    (a, b) => a.linea.localeCompare(b.linea) || a.orden - b.orden,
  );

  const filas: FilaInforme[] = [];

  for (const linea of ['CONDIMAR', 'NIDALCA'] as const) {
    for (const ref of ordenadas.filter((r) => r.linea === linea)) {
      const cajas = cajasPorReferencia.get(ref.id) ?? { antes: 0, hasta: 0 };
      filas.push(
        armarFila({
          referenciaId: ref.id,
          etiqueta: ref.etiqueta,
          linea,
          unidad: 'cajas',
          acumAnterior: cajas.antes,
          nuevoAcumulado: cajas.hasta,
          presupuesto: metaDe(linea, ref.id)?.metaCajas ?? 0,
          esTotal: false,
        }),
      );
    }

    // --- Total de la linea, en pesos ---
    const dinero = totalEnPesos(delMes, linea, desde);
    filas.push(
      armarFila({
        referenciaId: 'TOTAL',
        etiqueta: `TOTAL ${linea}`,
        linea,
        unidad: 'pesos',
        acumAnterior: dinero.antes,
        nuevoAcumulado: dinero.hasta,
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
    nuevoAcumulado: sumar(totales, 'nuevoAcumulado'),
    presupuesto: sumar(totales, 'presupuesto'),
    esTotal: true,
  });

  return {
    corte: e.corte,
    desde,
    hasta,
    filas,
    granTotal,
    pedidosContados: delMes.filter((p) => p.fecha >= desde).length,
  };
}

function armarFila(
  base: Omit<FilaInforme, 'ventasSemana' | 'pctCumplimiento' | 'falta'>,
): FilaInforme {
  const ventasSemana = base.nuevoAcumulado - base.acumAnterior;
  return {
    ...base,
    ventasSemana,
    // Sin meta no hay porcentaje. Poner 0% diria que no se cumplio, y lo
    // cierto es que no hay contra que medir.
    pctCumplimiento: base.presupuesto > 0 ? base.nuevoAcumulado / base.presupuesto : null,
    falta: base.presupuesto - base.nuevoAcumulado,
  };
}

function sumar(filas: FilaInforme[], campo: keyof FilaInforme): number {
  return filas.reduce((s, f) => s + (Number(f[campo]) || 0), 0);
}

/** Total facturado de una linea, antes del corte y hasta el corte. */
function totalEnPesos(pedidos: Pedido[], linea: Linea, desde: string) {
  let antes = 0;
  let hasta = 0;

  for (const p of pedidos) {
    if (p.linea !== linea) continue;
    // Se recalcula desde los renglones en vez de confiar en la cabecera
    // guardada: si un precio cambio, el pedido emitido manda.
    const total = p.items.reduce((s, it) => {
      const l = calcularLinea(it);
      return s + l.base + l.iva + l.icui;
    }, 0);
    hasta += total;
    if (p.fecha < desde) antes += total;
  }

  return { antes, hasta };
}

/** Las filas tal como se guardan en la pestaña `informe` de la hoja. */
export function informeAFilasDeHoja(informe: InformeSemanal): Record<string, unknown>[] {
  return [...informe.filas, informe.granTotal].map((f, i) => ({
    corte_id: informe.corte.id,
    linea: f.linea,
    orden: i + 1,
    referencia_id: f.referenciaId,
    referencia: f.etiqueta,
    unidad: f.unidad,
    acum_anterior: f.acumAnterior,
    ventas_semana: f.ventasSemana,
    nuevo_acumulado: f.nuevoAcumulado,
    presupuesto: f.presupuesto,
    pct_cumplimiento: f.pctCumplimiento ?? '',
    falta: f.falta,
  }));
}
