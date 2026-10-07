import type { FilaInforme } from './informeSemanal';
import { idPeriodo, type Periodo } from './periodos';
import type { Ajuste, Linea } from './types';

/**
 * Ajustes a mano del Informe: el acumulado que la app no conoce y las
 * devoluciones. Ver el tipo `Ajuste`.
 */

const dosDigitos = (n: number) => String(n).padStart(2, '0');

const mesDe = (p: Periodo) => ({
  anio: Number(p.hasta.slice(0, 4)),
  mes: Number(p.hasta.slice(5, 7)),
});

/** Uno por fila y por mes: escribirlo de nuevo lo reemplaza. */
export function idInicial(anio: number, mes: number, linea: Linea, referenciaId: string) {
  return `inicial|${anio}-${dosDigitos(mes)}|${linea}|${referenciaId}`;
}

/** Uno por fila y por periodo. */
export function idDevolucion(periodo: Periodo, linea: Linea, referenciaId: string) {
  return `devolucion|${idPeriodo(periodo)}|${linea}|${referenciaId}`;
}

export interface AjustesDeFila {
  /** Suma al acumulado anterior en cualquier periodo del mes. */
  inicial: number;
  /** Registradas en periodos que terminaron antes de este: restan del anterior. */
  devolucionesAntes: number;
  /** Registradas en un periodo que termina dentro de este. */
  devolucionesPeriodo: number;
}

/**
 * Lo que le toca a una fila del Informe en un periodo.
 *
 * Cada devolucion cuenta en la fecha en que termina el periodo donde se
 * registro. Asi, la del 14 al 19 aparece en la columna del periodo que
 * incluya el 19, resta del acumulado anterior en los que empiezan despues, y
 * no toca los que terminan antes.
 */
export function ajustesDeFila(
  ajustes: Ajuste[],
  periodo: Periodo,
  linea: Linea,
  referenciaId: string,
): AjustesDeFila {
  const { anio, mes } = mesDe(periodo);
  const r: AjustesDeFila = { inicial: 0, devolucionesAntes: 0, devolucionesPeriodo: 0 };

  for (const a of ajustes) {
    if (a.linea !== linea || a.referenciaId !== referenciaId) continue;
    if (a.anio !== anio || a.mes !== mes) continue;

    if (a.tipo === 'inicial') r.inicial += a.valor;
    else if (a.hasta < periodo.desde) r.devolucionesAntes += a.valor;
    else if (a.hasta <= periodo.hasta) r.devolucionesPeriodo += a.valor;
  }
  return r;
}

/** Lo que se escribio en una fila de la tabla. Ausente = no se toco. */
export interface Escrito {
  acumAnterior?: number;
  devoluciones?: number;
}

/**
 * Traduce lo escrito en la tabla a los ajustes que hay que guardar.
 *
 * En la tabla se escribe el resultado ("el acumulado anterior real es 50"),
 * pero se guarda la diferencia con lo que trae la app ("faltan 40"). Asi el
 * ajuste sigue valiendo cuando entran pedidos nuevos: no hay que corregirlo
 * cada semana.
 *
 * Se compara redondeado porque la tabla muestra pesos enteros: dejar la cifra
 * como estaba no debe crear un ajuste de centavos.
 */
export function ajustesEditados(
  fila: FilaInforme,
  periodo: Periodo,
  escrito: Escrito,
  ajustes: Ajuste[],
): Ajuste[] {
  const { anio, mes } = mesDe(periodo);
  const comun = { anio, mes, linea: fila.linea, referenciaId: fila.referenciaId };
  const cambios: Ajuste[] = [];

  const { acumAnterior, devoluciones } = escrito;

  if (acumAnterior !== undefined && Math.round(acumAnterior) !== Math.round(fila.acumAnterior)) {
    const sinAjuste = fila.acumAnterior - fila.ajusteInicial;
    cambios.push({
      ...comun,
      id: idInicial(anio, mes, fila.linea, fila.referenciaId),
      tipo: 'inicial',
      desde: '',
      hasta: '',
      valor: acumAnterior - sinAjuste,
    });
  }

  if (devoluciones !== undefined && Math.round(devoluciones) !== Math.round(fila.devoluciones)) {
    const id = idDevolucion(periodo, fila.linea, fila.referenciaId);
    // Puede haber devoluciones de otro periodo que cae dentro de este: se
    // respetan, y la de este periodo completa la cifra escrita.
    const propia = ajustes.find((a) => a.id === id)?.valor ?? 0;
    const deOtros = fila.devoluciones - propia;
    cambios.push({
      ...comun,
      id,
      tipo: 'devolucion',
      desde: periodo.desde,
      hasta: periodo.hasta,
      valor: devoluciones - deOtros,
    });
  }

  return cambios;
}

/** Aplica cambios sobre la lista, por id. Un ajuste en cero desaparece. */
export function aplicarAjustes(ajustes: Ajuste[], cambios: Ajuste[]): Ajuste[] {
  const porId = new Map(ajustes.map((a) => [a.id, a]));
  for (const c of cambios) {
    if (c.valor) porId.set(c.id, c);
    else porId.delete(c.id);
  }
  return [...porId.values()];
}
