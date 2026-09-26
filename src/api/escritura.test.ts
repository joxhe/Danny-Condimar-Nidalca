import { beforeEach, describe, expect, it, vi } from 'vitest';
import { guardarClientes, guardarProductos, setApiUrl } from './client';
import type { Cliente, ProductoCondimar, ProductoNidalca } from '../domain/types';

/**
 * Lo que se le manda a la hoja.
 *
 * Estas pruebas existen porque el mismo error volvio tres veces: la aplicacion
 * enviaba los nombres del dominio (`iva`, `compro: true`) donde la hoja espera
 * los suyos (`iva_pct`, `"SI"`). El script acomoda cada fila segun la cabecera,
 * asi que una llave mal escrita no falla: escribe una celda que despues no se
 * puede releer.
 *
 * Se afirma sobre el cuerpo del POST, no sobre el resultado, porque el daño
 * ocurre en la traduccion.
 */

const CLIENTE: Cliente = {
  id: 'CN-058',
  razon_social: 'SILVA CONDE L',
  nit: '92670609',
  dv: '',
  direccion: 'BRR 23 CL 22 1',
  ciudad: 'SAMPUES',
  telefono: '3118704219',
  plazo_credito: 8,
  compro: false,
  activo: true,
};

const CONDIMAR: ProductoCondimar = {
  id: 'PC-002',
  linea: 'CONDIMAR',
  categoria: 'General',
  producto: 'CLAVOS DE OLOR X 10 GR',
  precio: 1542,
  iva: 19,
  icui: 0,
  embalaje: 100,
  referenciaId: '1X100',
};

const NIDALCA: ProductoNidalca = {
  id: 'PN-001',
  linea: 'NIDALCA',
  categoria: 'Alimento *250gr',
  producto: 'ALIMENTO CANARIO NIDALIA X 250',
  precio: 2773,
  iva: 5,
  referenciaId: 'LAMINADOS',
};

/** Intercepta el POST y devuelve la primera fila del cuerpo enviado. */
function espiarEnvio() {
  // Los parametros se declaran para poder leer el cuerpo con tipos.
  const fetchFalso = vi.fn(
    async (_url: string, init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true, enviado: init?.body }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchFalso);

  return () => {
    const [, init] = fetchFalso.mock.calls[0];
    const cuerpo = JSON.parse(String(init?.body));
    return { cuerpo, fila: cuerpo.datos[0] as Record<string, unknown> };
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  setApiUrl('https://script.google.com/macros/s/X/exec');
});

describe('guardarClientes', () => {
  it('escribe la línea, sin la cual el cliente queda invisible', async () => {
    // `catalogos` filtra por linea: una celda vacia saca al cliente de la app.
    const leer = espiarEnvio();
    await guardarClientes('NIDALCA', [CLIENTE]);
    expect(leer().fila.linea).toBe('NIDALCA');
  });

  it('traduce compro y activo a SI/NO, no a booleanos', async () => {
    const leer = espiarEnvio();
    await guardarClientes('NIDALCA', [{ ...CLIENTE, compro: true, activo: false }]);
    const { fila } = leer();
    expect(fila.compro).toBe('SI');
    expect(fila.activo).toBe('NO');
  });

  it('un cliente que no compró queda en NO, no en FALSE', async () => {
    const leer = espiarEnvio();
    await guardarClientes('NIDALCA', [CLIENTE]);
    const { fila } = leer();
    expect(fila.compro).toBe('NO');
    expect(fila.activo).toBe('SI');
  });

  it('manda exactamente las columnas de la hoja', async () => {
    const leer = espiarEnvio();
    await guardarClientes('NIDALCA', [CLIENTE]);
    expect(Object.keys(leer().fila).sort()).toEqual(
      [
        'activo', 'ciudad', 'compro', 'direccion', 'dv', 'id', 'linea',
        'nit', 'plazo_credito', 'razon_social', 'telefono',
      ].sort(),
    );
  });
});

describe('guardarProductos', () => {
  it('usa iva_pct e icui_pct, los nombres de la hoja', async () => {
    const leer = espiarEnvio();
    await guardarProductos('CONDIMAR', [CONDIMAR]);
    const { fila } = leer();
    expect(fila.iva_pct).toBe(19);
    expect(fila.icui_pct).toBe(0);
    expect(fila).not.toHaveProperty('iva');
    expect(fila).not.toHaveProperty('icui');
  });

  it('usa referencia_id: sin ella el artículo no suma al Informe', async () => {
    const leer = espiarEnvio();
    await guardarProductos('CONDIMAR', [CONDIMAR]);
    const { fila } = leer();
    expect(fila.referencia_id).toBe('1X100');
    expect(fila).not.toHaveProperty('referenciaId');
  });

  it('conserva el embalaje, que decide las cajas del Informe', async () => {
    const leer = espiarEnvio();
    await guardarProductos('CONDIMAR', [CONDIMAR]);
    expect(leer().fila.embalaje).toBe(100);
  });

  it('Nidalca va con ICUI en cero y embalaje uno', async () => {
    // No tiene esos campos: se mandan explicitos para no dejar la celda vacia.
    const leer = espiarEnvio();
    await guardarProductos('NIDALCA', [NIDALCA]);
    const { fila } = leer();
    expect(fila.icui_pct).toBe(0);
    expect(fila.embalaje).toBe(1);
    expect(fila.iva_pct).toBe(5);
  });

  it('manda exactamente las columnas de la hoja', async () => {
    const leer = espiarEnvio();
    await guardarProductos('CONDIMAR', [CONDIMAR]);
    expect(Object.keys(leer().fila).sort()).toEqual(
      [
        'activo', 'categoria', 'embalaje', 'icui_pct', 'id', 'iva_pct',
        'linea', 'precio', 'producto', 'referencia_id',
      ].sort(),
    );
  });
});
