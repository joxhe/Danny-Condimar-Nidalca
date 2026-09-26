import { describe, expect, it } from 'vitest';
import { POLITICA_VIGENTE, acumularYConvertir, unidadesACajas, unidadesPorCaja } from './cajas';

describe('la excepcion que planteo el cliente', () => {
  it('30 unidades de un 1x100 no suman a la casilla', () => {
    const r = unidadesACajas(30, 100, 'cajas-completas');
    expect(r.cajas).toBe(0);
    expect(r.unidadesPendientes).toBe(30);
  });

  it('pero quedan registradas: 30 + 80 de la semana siguiente si completan caja', () => {
    const r = acumularYConvertir([30, 80], 100, 'cajas-completas');
    expect(r.cajas).toBe(1);
    expect(r.unidadesPendientes).toBe(10);
  });

  it('convertir semana a semana daria un resultado menor, y equivocado', () => {
    const porSemana =
      unidadesACajas(30, 100).cajas + unidadesACajas(80, 100).cajas;
    const acumulado = acumularYConvertir([30, 80], 100).cajas;
    expect(porSemana).toBe(0);
    expect(acumulado).toBe(1);
  });

  it('350 unidades de un 1x100 dan 3 cajas y 50 pendientes', () => {
    const r = unidadesACajas(350, 100, 'cajas-completas');
    expect(r.cajas).toBe(3);
    expect(r.unidadesPendientes).toBe(50);
    expect(r.cajasExactas).toBe(3.5);
  });
});

// Confirmado con el cliente: rige 'cajas-completas'. Estas quedan cubiertas
// por si el criterio cambia, no porque se usen hoy.
describe('politicas alternativas, no vigentes', () => {
  it('fraccion-exacta', () => {
    const r = unidadesACajas(350, 100, 'fraccion-exacta');
    expect(r.cajas).toBe(3.5);
    expect(r.unidadesPendientes).toBe(0);
  });

  it('media-caja', () => {
    expect(unidadesACajas(350, 100, 'media-caja').cajas).toBe(3.5);
    expect(unidadesACajas(30, 100, 'media-caja').cajas).toBe(0);
    expect(unidadesACajas(60, 100, 'media-caja').cajas).toBe(0.5);
  });
});

describe('embalaje', () => {
  it('los articulos por kilo se cuentan uno a uno', () => {
    // BICARBONATO X KILO y companeros traen "KILO" en vez de una cantidad.
    expect(unidadesPorCaja('KILO')).toBe(1);
    expect(unidadesACajas(50, 'KILO').cajas).toBe(50);
  });

  it('un embalaje vacio o invalido no rompe el calculo', () => {
    expect(unidadesPorCaja('')).toBe(1);
    expect(unidadesPorCaja(0)).toBe(1);
    expect(unidadesACajas(12, '').cajas).toBe(12);
  });

  it('embalajes reales del catalogo', () => {
    expect(unidadesACajas(16, 16).cajas).toBe(1); // BOLSA INST
    expect(unidadesACajas(48, 16).cajas).toBe(3);
    expect(unidadesACajas(25, 25).cajas).toBe(1); // 1x25
    expect(unidadesACajas(144, 72).cajas).toBe(2); // 72x4
  });
});

describe('casos degenerados', () => {
  it('cero, negativo y NaN no suman', () => {
    expect(unidadesACajas(0, 100).cajas).toBe(0);
    expect(unidadesACajas(-5, 100).cajas).toBe(0);
    expect(unidadesACajas(NaN, 100).cajas).toBe(0);
  });
});

describe('politica vigente', () => {
  it('es cajas completas, la que confirmo el cliente', () => {
    expect(POLITICA_VIGENTE).toBe('cajas-completas');
    // Y es la que se aplica cuando no se pasa politica explicita.
    expect(unidadesACajas(350, 100).cajas).toBe(3);
  });
});
