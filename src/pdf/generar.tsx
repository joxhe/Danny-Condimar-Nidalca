import { pdf } from '@react-pdf/renderer';
import type { Informe } from '../domain/informes';
import type { Pedido } from '../domain/types';
import type { InformeSemanal } from '../domain/informeSemanal';
import { InformePDF } from './InformePDF';
import { InformeSemanalPDF } from './InformeSemanalPDF';
import { PedidoPDF } from './PedidoPDF';

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

export function informeABlob(informe: Informe): Promise<Blob> {
  return pdf(<InformePDF informe={informe} />).toBlob();
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

export function informeSemanalABlob(informe: InformeSemanal): Promise<Blob> {
  return pdf(<InformeSemanalPDF informe={informe} />).toBlob();
}

export function nombreInformeSemanal(informe: InformeSemanal): string {
  const c = informe.corte;
  return `Informe-${c.anio}-${String(c.mes).padStart(2, '0')}-S${c.semana}.pdf`;
}

export function nombreInforme(informe: Informe): string {
  return `Informe-ventas-${informe.desde}_${informe.hasta}.pdf`;
}

export type ModoEntrega = 'compartido' | 'descargado';

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se revoca en el siguiente tick: revocar de inmediato cancela la descarga
  // en algunos navegadores moviles.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * En movil ofrece la hoja de compartir del sistema (WhatsApp, correo, Drive).
 * En escritorio, o si el usuario cancela, descarga el archivo.
 */
export async function entregar(blob: Blob, nombre: string): Promise<ModoEntrega> {
  const archivo = new File([blob], nombre, { type: 'application/pdf' });

  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return 'compartido';
    } catch (e) {
      // AbortError = el usuario cerro la hoja de compartir a proposito.
      if (e instanceof DOMException && e.name === 'AbortError') return 'compartido';
      // Cualquier otro fallo cae a la descarga.
    }
  }

  descargar(blob, nombre);
  return 'descargado';
}

/** Abre el PDF en otra pestania, para revisarlo antes de enviarlo. */
export function previsualizar(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
