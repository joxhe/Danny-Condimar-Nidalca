import condimar from '../images/Condimar.png?inline';
import nidalca from '../images/Nidalca.png?inline';
import type { Linea } from '../domain/types';

/**
 * Logos para el PDF, incrustados como data URI.
 *
 * El sufijo `?inline` de Vite los convierte en base64 dentro del bundle. Es a
 * proposito: un `<Image>` con URL remota obliga al motor de PDF a descargarla,
 * y esa descarga puede fallar o llegar tarde. Misma regla que con las fuentes.
 *
 * Cada logo lleva sus medidas porque las proporciones no coinciden: el de
 * Condimar es casi cuadrado y el de Nidalca es una franja de texto ancha.
 */
export interface LogoPdf {
  src: string;
  ancho: number;
  alto: number;
}

const ALTO = 30;

export const LOGOS: Record<Linea, LogoPdf> = {
  CONDIMAR: {
    src: condimar,
    alto: ALTO,
    ancho: Math.round(ALTO * (391 / 269)), // 44
  },
  NIDALCA: {
    src: nidalca,
    alto: ALTO,
    ancho: Math.round(ALTO * (382 / 184)), // 62
  },
};
