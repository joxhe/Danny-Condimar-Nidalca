import { pdf } from '@react-pdf/renderer';
import type { Informe } from '../domain/informes';
import type { Pedido } from '../domain/types';
import type { InformeSemanal } from '../domain/informeSemanal';
import { InformePDF } from './InformePDF';
import { InformeSemanalPDF } from './InformeSemanalPDF';
import { PedidoPDF, PedidosPDF } from './PedidoPDF';

/**
 * Entrega del documento.
 *
 * Aqui esta el cambio de fondo frente a la version anterior. Antes se llamaba
 * a window.print() y se dejaba que el navegador dibujara el DOM: en varios
 * Android el evento afterprint se dispara ANTES de generar la vista previa, el
 * documento se desmontaba en ese momento y salia la hoja en blanco.
 *
 * Ahora el PDF se construye en memoria como un Blob. No interviene el dialogo
 * de impresion, ni el CSS @media print, ni el servicio del sistema: el archivo
 * ya esta completo antes de que nadie lo mire. El mismo byte a byte en todo
 * dispositivo.
 */

export function pedidoABlob(pedido: Pedido): Promise<Blob> {
  return pdf(<PedidoPDF pedido={pedido} />).toBlob();
}

/** Papel en el que se va a imprimir un lote de pedidos. */
export type Papel = 'media-carta' | 'carta-doble';

/** Como un talonario: por linea y, dentro de cada una, por numero. */
function enOrden(pedidos: Pedido[]): Pedido[] {
  return [...pedidos].sort(
    (a, b) => a.linea.localeCompare(b.linea) || Number(a.numero) - Number(b.numero),
  );
}

/**
 * Varios pedidos listos para imprimir.
 *
 *   media-carta  Una media hoja por pedido. Para papel ya cortado por la mitad.
 *   carta-doble  Dos pedidos por hoja carta, con linea de corte al medio.
 *
 * En los dos casos el PDF ya trae el tamaño de la hoja final, asi que no hace
 * falta acomodar nada en el dialogo de impresion.
 */
export async function pedidosParaImprimir(pedidos: Pedido[], papel: Papel): Promise<Blob> {
  const medias = await pdf(<PedidosPDF pedidos={enOrden(pedidos)} />).toBlob();
  if (papel === 'media-carta') return medias;

  // pdf-lib pesa unos 200 KB y solo hace falta para acomodar de a dos: se
  // carga aparte, para que compartir un pedido desde el celular no la baje.
  const { imponerDosPorHoja } = await import('./imponer');
  const hojas = await imponerDosPorHoja(await medias.arrayBuffer());
  return new Blob([hojas as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

export function informeABlob(informe: Informe): Promise<Blob> {
  return pdf(<InformePDF informe={informe} />).toBlob();
}

export function informeSemanalABlob(informe: InformeSemanal): Promise<Blob> {
  return pdf(<InformeSemanalPDF informe={informe} />).toBlob();
}

export function nombreInforme(informe: Informe): string {
  return `Informe-ventas-${informe.desde}_${informe.hasta}.pdf`;
}

/** Abre el PDF en otra pestania, para revisarlo antes de enviarlo. */
export function previsualizar(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
