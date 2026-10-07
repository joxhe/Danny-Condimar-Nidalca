/**
 * Periodo del Informe: el intervalo de dias que se elige en el calendario.
 *
 * Va siempre dentro de un mismo mes. El presupuesto es mensual y el acumulado
 * arranca el dia 1, asi que un intervalo del 28 de septiembre al 3 de octubre
 * no tendria contra que meta medirse. El calendario no deja armarlo.
 *
 * Las fechas viajan como texto ISO ("2026-09-07"): se comparan y ordenan como
 * texto sin pasar por zonas horarias. Cuando hace falta el dia de la semana se
 * calcula en UTC, porque con la hora local el cambio de horario o la zona del
 * navegador podrian correr un dia y desarmar el calendario.
 */

export interface Periodo {
  /** Primer dia, incluido. */
  desde: string;
  /** Ultimo dia, incluido. */
  hasta: string;
}

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const dosDigitos = (n: number) => String(n).padStart(2, '0');

export const iso = (anio: number, mes: number, dia: number) =>
  `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;

const partes = (fecha: string) => fecha.split('-').map(Number) as [number, number, number];

const enUTC = (fecha: string) => {
  const [anio, mes, dia] = partes(fecha);
  return Date.UTC(anio, mes - 1, dia);
};

export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** De 0 (domingo) a 6 (sabado). */
export function diaDeLaSemana(fecha: string): number {
  return new Date(enUTC(fecha)).getUTCDay();
}

function sumarDias(fecha: string, dias: number): string {
  const f = new Date(enUTC(fecha) + dias * 86_400_000);
  return iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
}

export const mismoMes = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

/** Mes anterior o siguiente de "2026-09", sin pasar por fechas. */
export function moverMes(mes: string, delta: number): string {
  const [anio, m] = mes.split('-').map(Number);
  const total = anio * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${dosDigitos((total % 12) + 1)}`;
}

/**
 * El periodo con el que abre el Informe: de lunes a sabado de la semana de
 * `fecha`, recortado al mes. Un domingo muestra la semana que cerro el dia
 * anterior.
 *
 *   martes 29 de septiembre   ->  del 28 al 30 de septiembre
 *   jueves 1 de octubre       ->  del 1 al 3 de octubre
 *   domingo 20 de septiembre  ->  del 14 al 19 de septiembre
 */
export function semanaDe(fecha: string): Periodo {
  const referencia = diaDeLaSemana(fecha) === 0 ? sumarDias(fecha, -1) : fecha;
  const lunes = sumarDias(referencia, 1 - diaDeLaSemana(referencia));
  const sabado = sumarDias(lunes, 5);

  const [anio, mes] = partes(referencia);
  const primero = iso(anio, mes, 1);
  const ultimo = iso(anio, mes, ultimoDiaDelMes(anio, mes));

  return {
    desde: lunes < primero ? primero : lunes,
    hasta: sabado > ultimo ? ultimo : sabado,
  };
}

/**
 * Lo que pasa al tocar un dia del calendario.
 *
 * El primer toque marca un extremo y el segundo el otro, en cualquier orden:
 * tocar el 12 y despues el 7 tambien da del 7 al 12. Tocar dos veces el mismo
 * dia da un periodo de un solo dia. Si el segundo toque cae en otro mes, se
 * toma como un comienzo nuevo, porque el periodo no puede cruzar de mes.
 */
export function tocarDia(
  inicio: string | null,
  dia: string,
): { inicio: string } | { periodo: Periodo } {
  if (!inicio || !mismoMes(inicio, dia)) return { inicio: dia };
  return {
    periodo: inicio <= dia ? { desde: inicio, hasta: dia } : { desde: dia, hasta: inicio },
  };
}

/**
 * La cuadricula de un mes, en semanas de lunes a domingo. Los huecos antes
 * del dia 1 y despues del ultimo van en null.
 */
export function cuadriculaDelMes(anio: number, mes: number): (string | null)[][] {
  // Lunes = 0 ... domingo = 6.
  const hueco = (diaDeLaSemana(iso(anio, mes, 1)) + 6) % 7;
  const celdas: (string | null)[] = Array(hueco).fill(null);

  for (let dia = 1; dia <= ultimoDiaDelMes(anio, mes); dia++) {
    celdas.push(iso(anio, mes, dia));
  }
  while (celdas.length % 7) celdas.push(null);

  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

/** Cantidad de dias, contando los dos extremos. */
export function diasDelPeriodo({ desde, hasta }: Periodo): number {
  return Math.round((enUTC(hasta) - enUTC(desde)) / 86_400_000) + 1;
}

/** "7 de septiembre de 2026" o "del 7 al 12 de septiembre de 2026". */
export function tituloPeriodo({ desde, hasta }: Periodo): string {
  const [a1, m1, d1] = partes(desde);
  const [a2, m2, d2] = partes(hasta);

  if (desde === hasta) return `${d1} de ${MESES[m1 - 1]} de ${a1}`;
  if (a1 === a2 && m1 === m2) return `del ${d1} al ${d2} de ${MESES[m1 - 1]} de ${a1}`;
  if (a1 === a2) return `del ${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]} de ${a1}`;
  return `del ${d1} de ${MESES[m1 - 1]} de ${a1} al ${d2} de ${MESES[m2 - 1]} de ${a2}`;
}

/** "martes 7 de septiembre": para leer un dia suelto en voz alta. */
export function nombreDelDia(fecha: string): string {
  const [, mes, dia] = partes(fecha);
  return `${DIAS[diaDeLaSemana(fecha)]} ${dia} de ${MESES[mes - 1]}`;
}

/**
 * Identificador del periodo en la pestaña `informe` de la hoja.
 *
 * Escribir dos veces el mismo intervalo reemplaza sus filas; uno distinto
 * agrega las suyas. Ordenado como texto, queda en orden cronologico.
 */
export function idPeriodo({ desde, hasta }: Periodo): string {
  return `${desde}_${hasta}`;
}
