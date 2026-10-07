import { describe, expect, it } from 'vitest';
import {
  cuadriculaDelMes,
  diaDeLaSemana,
  diasDelPeriodo,
  idPeriodo,
  moverMes,
  nombreDelDia,
  semanaDe,
  tituloPeriodo,
  tocarDia,
} from './periodos';

describe('elegir el periodo en el calendario', () => {
  it('dos toques arman el intervalo', () => {
    const primero = tocarDia(null, '2026-09-07');
    expect(primero).toEqual({ inicio: '2026-09-07' });
    expect(tocarDia('2026-09-07', '2026-09-12')).toEqual({
      periodo: { desde: '2026-09-07', hasta: '2026-09-12' },
    });
  });

  it('el orden de los toques no importa', () => {
    expect(tocarDia('2026-09-12', '2026-09-07')).toEqual({
      periodo: { desde: '2026-09-07', hasta: '2026-09-12' },
    });
  });

  it('tocar dos veces el mismo dia da un periodo de un dia', () => {
    expect(tocarDia('2026-09-28', '2026-09-28')).toEqual({
      periodo: { desde: '2026-09-28', hasta: '2026-09-28' },
    });
  });

  it('los dias sueltos del final del mes se pueden elegir solos', () => {
    // El caso que dejaban por fuera las semanas fijas: del 28 al 30.
    expect(tocarDia('2026-09-28', '2026-09-30')).toEqual({
      periodo: { desde: '2026-09-28', hasta: '2026-09-30' },
    });
  });

  it('un segundo toque en otro mes empieza de nuevo: el periodo no cruza de mes', () => {
    expect(tocarDia('2026-09-28', '2026-10-03')).toEqual({ inicio: '2026-10-03' });
  });
});

describe('periodo con el que abre el Informe', () => {
  it('de lunes a sabado de la semana de hoy', () => {
    // Martes 6 de octubre de 2026.
    expect(semanaDe('2026-10-06')).toEqual({ desde: '2026-10-05', hasta: '2026-10-10' });
  });

  it('un domingo muestra la semana que acaba de cerrar', () => {
    expect(semanaDe('2026-09-20')).toEqual({ desde: '2026-09-14', hasta: '2026-09-19' });
  });

  it('se recorta al final del mes', () => {
    // La semana del 28 sigue en octubre, pero el periodo no cruza de mes.
    expect(semanaDe('2026-09-29')).toEqual({ desde: '2026-09-28', hasta: '2026-09-30' });
  });

  it('y al principio', () => {
    expect(semanaDe('2026-10-01')).toEqual({ desde: '2026-10-01', hasta: '2026-10-03' });
  });

  it('un domingo 1 de mes muestra la ultima semana del mes anterior', () => {
    // Domingo 1 de noviembre de 2026: la semana que cerro fue del 26 al 31 de octubre.
    expect(semanaDe('2026-11-01')).toEqual({ desde: '2026-10-26', hasta: '2026-10-31' });
  });
});

describe('cuadricula del calendario', () => {
  it('septiembre 2026 empieza en martes: un hueco antes del 1', () => {
    const [primera] = cuadriculaDelMes(2026, 9);
    expect(primera).toEqual([
      null,
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
  });

  it('cada fila es de lunes a domingo', () => {
    for (const semana of cuadriculaDelMes(2026, 9)) {
      expect(semana).toHaveLength(7);
      if (semana[0]) expect(diaDeLaSemana(semana[0])).toBe(1);
      if (semana[6]) expect(diaDeLaSemana(semana[6])).toBe(0);
    }
  });

  it('trae todos los dias del mes, sin repetir', () => {
    const dias = cuadriculaDelMes(2028, 2).flat().filter(Boolean);
    expect(dias).toHaveLength(29); // 2028 es bisiesto
    expect(new Set(dias).size).toBe(29);
  });

  it('un mes que empieza en lunes no lleva hueco', () => {
    expect(cuadriculaDelMes(2026, 6)[0][0]).toBe('2026-06-01');
  });
});

describe('textos y nombres', () => {
  it('el titulo se lee como una fecha', () => {
    expect(tituloPeriodo({ desde: '2026-09-07', hasta: '2026-09-12' })).toBe(
      'del 7 al 12 de septiembre de 2026',
    );
    expect(tituloPeriodo({ desde: '2026-09-28', hasta: '2026-09-28' })).toBe(
      '28 de septiembre de 2026',
    );
  });

  it('cuenta los dias incluyendo los dos extremos', () => {
    expect(diasDelPeriodo({ desde: '2026-09-07', hasta: '2026-09-12' })).toBe(6);
    expect(diasDelPeriodo({ desde: '2026-09-28', hasta: '2026-09-28' })).toBe(1);
  });

  it('nombra el dia con su dia de la semana', () => {
    expect(nombreDelDia('2026-09-07')).toBe('lunes 7 de septiembre');
  });

  it('el id cambia con cualquiera de los dos extremos', () => {
    expect(idPeriodo({ desde: '2026-09-07', hasta: '2026-09-12' })).toBe('2026-09-07_2026-09-12');
    expect(idPeriodo({ desde: '2026-09-07', hasta: '2026-09-11' })).not.toBe(
      idPeriodo({ desde: '2026-09-07', hasta: '2026-09-12' }),
    );
  });

  it('mueve el mes sin enredarse con el cambio de año', () => {
    expect(moverMes('2026-12', 1)).toBe('2027-01');
    expect(moverMes('2027-01', -1)).toBe('2026-12');
    expect(moverMes('2026-09', 1)).toBe('2026-10');
  });
});
