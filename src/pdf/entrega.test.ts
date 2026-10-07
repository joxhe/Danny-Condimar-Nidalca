import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardarPdf, nombrePedido } from './entrega';
import type { Pedido } from '../domain/types';

/*
 * El selector "Guardar como" solo se puede abrir unos segundos despues del
 * toque. Si se arma el PDF primero, en un celular lento el navegador lo
 * rechaza. Estas pruebas fijan el orden: primero preguntar donde, despues
 * generar.
 */

const PDF = new Blob(['%PDF-'], { type: 'application/pdf' });

function selectorFalso(respuesta: 'acepta' | 'cancela', registro: string[]) {
  const escrito: Blob[] = [];
  const selector = vi.fn(async () => {
    registro.push('selector');
    if (respuesta === 'cancela') throw new DOMException('cancelado', 'AbortError');
    return {
      createWritable: async () => ({
        write: async (b: Blob) => void escrito.push(b),
        close: async () => void registro.push('cerrado'),
      }),
    };
  });
  vi.stubGlobal('showSaveFilePicker', selector);
  return { selector, escrito };
}

afterEach(() => vi.unstubAllGlobals());

describe('guardar el PDF preguntando donde', () => {
  it('abre el selector antes de generar el PDF', async () => {
    const registro: string[] = [];
    selectorFalso('acepta', registro);
    const generar = vi.fn(async () => {
      registro.push('generar');
      return PDF;
    });

    expect(await guardarPdf('Pedido-1.pdf', generar)).toBe('guardado');
    expect(registro).toEqual(['selector', 'generar', 'cerrado']);
  });

  it('propone el nombre del archivo y escribe el PDF generado', async () => {
    const { selector, escrito } = selectorFalso('acepta', []);
    await guardarPdf('Pedido-Condimar-12.pdf', async () => PDF);
    expect(selector).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'Pedido-Condimar-12.pdf' }),
    );
    expect(escrito).toEqual([PDF]);
  });

  it('si se cancela no genera nada', async () => {
    selectorFalso('cancela', []);
    const generar = vi.fn(async () => PDF);
    expect(await guardarPdf('x.pdf', generar)).toBe('cancelado');
    expect(generar).not.toHaveBeenCalled();
  });

  it('sin selector en el navegador, descarga como antes', async () => {
    const clic = vi.fn();
    vi.stubGlobal('document', {
      createElement: () => ({ click: clic, remove: () => {} }),
      body: { appendChild: () => {} },
    });
    expect(await guardarPdf('x.pdf', async () => PDF)).toBe('descargado');
    expect(clic).toHaveBeenCalledOnce();
  });
});

describe('nombre del archivo', () => {
  it('lleva empresa, numero y cliente, sin tildes ni signos', () => {
    const pedido = {
      linea: 'NIDALCA',
      numero: 19,
      cliente: { razon_social: 'POSADA DURANGO VIVIANA MARÍA' },
    } as unknown as Pedido;
    expect(nombrePedido(pedido)).toBe('Pedido-Nidalca-19-POSADA-DURANGO-VIVIANA-MARIA.pdf');
  });
});
