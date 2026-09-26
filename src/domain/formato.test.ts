import { describe, expect, it } from 'vitest';
import { COP, fechaEsPasada, fmtDate, noAntesDeHoy, todayISO } from './formato';

describe('COP', () => {
  it('formatea con separador de miles colombiano', () => {
    expect(COP(485668)).toBe('$485.668');
    expect(COP(0)).toBe('$0');
  });

  it('redondea al peso', () => {
    expect(COP(485668.224)).toBe('$485.668');
    expect(COP(72907.2)).toBe('$72.907');
  });

  it('tolera nulos y NaN', () => {
    expect(COP(null)).toBe('$0');
    expect(COP(undefined)).toBe('$0');
    expect(COP(NaN)).toBe('$0');
  });
});

describe('fmtDate', () => {
  it('pasa de ISO a dd/mm/aaaa', () => {
    expect(fmtDate('2026-09-08')).toBe('08/09/2026');
  });

  it('devuelve vacio si no hay fecha', () => {
    expect(fmtDate('')).toBe('');
    expect(fmtDate(null)).toBe('');
  });
});

describe('todayISO', () => {
  it('usa la fecha local, no UTC', () => {
    // toISOString() habria corrido el dia despues de las 19:00 en Colombia.
    const d = new Date();
    const esperado = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
    expect(todayISO()).toBe(esperado);
  });
});

describe('fecha del pedido', () => {
  const hoy = todayISO();
  const dias = (n: number) => {
    const d = new Date(hoy + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  it('ayer es pasada; hoy y mañana no', () => {
    expect(fechaEsPasada(dias(-1))).toBe(true);
    expect(fechaEsPasada(hoy)).toBe(false);
    expect(fechaEsPasada(dias(1))).toBe(false);
  });

  it('una fecha vacía no se considera pasada', () => {
    // El campo recien vaciado no debe disparar el error de validacion.
    expect(fechaEsPasada('')).toBe(false);
  });

  it('noAntesDeHoy adelanta lo vencido y respeta lo demás', () => {
    expect(noAntesDeHoy(dias(-30))).toBe(hoy);
    expect(noAntesDeHoy(hoy)).toBe(hoy);
    expect(noAntesDeHoy(dias(5))).toBe(dias(5)); // un pedido programado se respeta
  });

  it('compara por texto, sin zonas horarias de por medio', () => {
    expect(fechaEsPasada('2020-01-01')).toBe(true);
    expect(fechaEsPasada('2099-12-31')).toBe(false);
  });
});
