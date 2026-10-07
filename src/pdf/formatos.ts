/**
 * Tamaños de pagina, en puntos (72 por pulgada).
 *
 * Aparte de los componentes para que el recargado en caliente de Vite siga
 * funcionando: un archivo que exporta componentes y constantes a la vez lo
 * obliga a recargar la pagina entera.
 */

/**
 * Media carta VERTICAL: 5,5 x 8,5 pulgadas (14 x 21,6 cm).
 *
 * Vertical porque asi entra la media hoja en la impresora: por el lado
 * angosto. Una pagina horizontal sobre papel vertical obliga al driver a
 * rotarla, y si no lo hace corta todo lo que no cabe. Con la pagina igual al
 * papel no hay nada que rotar ni que interpretar.
 */
export const MEDIA_CARTA: [number, number] = [396, 612];

/** Carta vertical: 8,5 x 11 pulgadas. */
export const CARTA: [number, number] = [612, 792];
