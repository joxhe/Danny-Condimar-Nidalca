/**
 * Conversion de unidades facturadas a cajas para el Informe.
 *
 * El Informe cuenta CAJAS por referencia de empaque, no unidades ni pesos.
 * El cliente planteo una excepcion: "si se facturan 30 unidades, no se hace el
 * autosum en la casilla 1x100, porque no se ha completado el minimo de unidades
 * para acumular esta referencia".
 *
 * Por eso la fuente de verdad que se guarda es SIEMPRE la unidad facturada, y
 * las cajas se derivan al momento de armar el Informe. Guardar cajas seria
 * perder informacion: las 30 unidades que hoy no suman deben poder completarse
 * con las de la semana siguiente.
 */

/** Cuantas unidades entran en una caja. Puede no ser numerico ("KILO"). */
export type Embalaje = number | string;

/**
 * Politica confirmada por el cliente: SOLO CAJAS COMPLETAS.
 *
 * Las otras dos quedan implementadas y testeadas por si el criterio cambia,
 * pero no se usan. El 3,5 que aparece en 1x100 en la SEM 1 de la hoja de
 * agosto fue una carga manual, no el resultado de esta regla.
 */
export const POLITICA_VIGENTE: PoliticaAcumulacion = 'cajas-completas';

export type PoliticaAcumulacion =
  /** Solo suman las cajas completas. El resto queda pendiente. */
  | 'cajas-completas'
  /** Suma la fraccion exacta: 30 de 100 valen 0,3 cajas. */
  | 'fraccion-exacta'
  /** Suma de media caja en media caja. Concilia las dos anteriores. */
  | 'media-caja';

export interface ConversionCajas {
  /** Cajas que suman al Informe segun la politica. */
  cajas: number;
  /** Unidades que quedaron sin completar caja y pasan al periodo siguiente. */
  unidadesPendientes: number;
  /** Cajas que habria si se contara la fraccion exacta. Para auditar. */
  cajasExactas: number;
}

export const SIN_CONVERSION: ConversionCajas = {
  cajas: 0,
  unidadesPendientes: 0,
  cajasExactas: 0,
};

/**
 * Unidades por caja como numero.
 *
 * Algunos articulos traen "KILO" en vez de una cantidad (BICARBONATO X KILO,
 * COMINO X KILO...). Ahi la unidad de venta ya es la unidad de informe, asi
 * que el embalaje es 1.
 */
export function unidadesPorCaja(embalaje: Embalaje): number {
  const n = Number(embalaje);
  if (Number.isFinite(n) && n > 0) return n;
  return 1;
}

export function unidadesACajas(
  unidades: number,
  embalaje: Embalaje,
  politica: PoliticaAcumulacion = POLITICA_VIGENTE,
): ConversionCajas {
  const u = Number(unidades);
  if (!Number.isFinite(u) || u <= 0) return SIN_CONVERSION;

  const porCaja = unidadesPorCaja(embalaje);
  const cajasExactas = u / porCaja;

  if (politica === 'fraccion-exacta') {
    return { cajas: cajasExactas, unidadesPendientes: 0, cajasExactas };
  }

  if (politica === 'media-caja') {
    const cajas = Math.floor(cajasExactas * 2) / 2;
    return {
      cajas,
      unidadesPendientes: Math.round(u - cajas * porCaja),
      cajasExactas,
    };
  }

  const cajas = Math.floor(cajasExactas);
  return {
    cajas,
    unidadesPendientes: Math.round(u - cajas * porCaja),
    cajasExactas,
  };
}

/**
 * Acumula unidades de varios periodos antes de convertir.
 *
 * Es lo que hace que las 30 unidades de esta semana se junten con las 80 de la
 * siguiente y recien ahi sumen una caja. Convertir semana a semana y despues
 * sumar daria un resultado distinto, y menor.
 */
export function acumularYConvertir(
  unidadesPorPeriodo: number[],
  embalaje: Embalaje,
  politica: PoliticaAcumulacion = POLITICA_VIGENTE,
): ConversionCajas {
  const total = unidadesPorPeriodo.reduce((s, u) => s + (Number(u) || 0), 0);
  return unidadesACajas(total, embalaje, politica);
}
