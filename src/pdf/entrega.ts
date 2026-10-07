import type { InformeSemanal } from '../domain/informeSemanal';
import type { Pedido } from '../domain/types';

/**
 * Entrega del PDF: guardarlo donde el usuario elija, o compartirlo.
 *
 * Va aparte del motor de PDF (`generar.tsx`, mas de un megabyte) porque los
 * botones necesitan saber que ofrecer antes de que nadie pida un documento.
 * Por eso las funciones reciben `generar` en vez del archivo ya hecho: el
 * motor se carga recien cuando hace falta.
 */

export type ResultadoGuardar = 'guardado' | 'descargado' | 'cancelado';

/** El selector "Guardar como" del sistema. No esta en todos los navegadores. */
type SelectorGuardar = (opciones: {
  suggestedName?: string;
  /** Con el mismo id, el navegador recuerda la ultima carpeta elegida. */
  id?: string;
  startIn?: 'downloads' | 'documents' | 'desktop';
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

function selectorGuardar(): SelectorGuardar | undefined {
  return (globalThis as { showSaveFilePicker?: SelectorGuardar }).showSaveFilePicker;
}

const esCancelacion = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/**
 * Guarda el PDF preguntando donde.
 *
 * Con el selector del sistema (Chrome y Edge en PC, Chrome reciente en
 * Android) se elige carpeta y nombre. El selector se abre ANTES de generar el
 * archivo: el navegador solo lo permite unos segundos despues del toque, y
 * armar el PDF puede tardar mas que eso.
 *
 * Sin selector, o si el navegador lo rechaza, se descarga como siempre. Ahi la
 * carpeta la decide la configuracion de descargas del navegador.
 */
export async function guardarPdf(
  nombre: string,
  generar: () => Promise<Blob>,
): Promise<ResultadoGuardar> {
  const selector = selectorGuardar();

  if (selector) {
    let destino: FileSystemFileHandle | null = null;
    try {
      destino = await selector({
        suggestedName: nombre,
        id: 'pdf-pedidos',
        startIn: 'downloads',
        types: [{ description: 'Documento PDF', accept: { 'application/pdf': ['.pdf'] } }],
      });
    } catch (e) {
      if (esCancelacion(e)) return 'cancelado';
      // Cualquier otro rechazo (sin permiso, contexto inseguro) cae a la descarga.
    }

    if (destino) {
      const blob = await generar();
      const escritura = await destino.createWritable();
      await escritura.write(blob);
      await escritura.close();
      return 'guardado';
    }
  }

  descargar(await generar(), nombre);
  return 'descargado';
}

/** Hay hoja de compartir con archivos y la pantalla es tactil: un celular. */
export function puedeCompartir(): boolean {
  try {
    const tactil = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
    const prueba = new File([], 'prueba.pdf', { type: 'application/pdf' });
    return tactil && !!navigator.canShare?.({ files: [prueba] });
  } catch {
    return false;
  }
}

/**
 * Abre la hoja de compartir del sistema: WhatsApp, correo, Drive.
 *
 * Si el navegador la rechaza (paso demasiado tiempo desde el toque mientras
 * se armaba el PDF) se descarga, para no dejar al usuario sin el archivo.
 */
export async function compartirPdf(
  nombre: string,
  generar: () => Promise<Blob>,
): Promise<'compartido' | 'cancelado' | 'descargado'> {
  const blob = await generar();
  const archivo = new File([blob], nombre, { type: 'application/pdf' });
  try {
    await navigator.share({ files: [archivo], title: nombre });
    return 'compartido';
  } catch (e) {
    if (esCancelacion(e)) return 'cancelado';
    descargar(blob, nombre);
    return 'descargado';
  }
}

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se revoca despues: revocar de inmediato cancela la descarga en algunos
  // navegadores moviles.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function nombrePedido(pedido: Pedido): string {
  const empresa = pedido.linea === 'NIDALCA' ? 'Nidalca' : 'Condimar';
  const cliente = (pedido.cliente?.razon_social ?? 'cliente')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `Pedido-${empresa}-${pedido.numero}-${cliente}.pdf`;
}

/** "Informe-2026-09-07_al_12.pdf", o "Informe-2026-09-28.pdf" si es un solo dia. */
export function nombreInformeSemanal(informe: InformeSemanal): string {
  const { desde, hasta } = informe;
  return desde === hasta ? `Informe-${desde}.pdf` : `Informe-${desde}_al_${hasta.slice(8)}.pdf`;
}
