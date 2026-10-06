/**
 * Tamaños de pagina, en puntos (72 por pulgada).
 *
 * Aparte de los componentes para que el recargado en caliente de Vite siga
 * funcionando: un archivo que exporta componentes y constantes a la vez lo
 * obliga a recargar la pagina entera.
 */

/** Media carta horizontal: 8,5 x 5,5 pulgadas, la mitad exacta de una carta. */
export const MEDIA_CARTA_HORIZONTAL: [number, number] = [612, 396];

/** Carta vertical: 8,5 x 11 pulgadas. */
export const CARTA: [number, number] = [612, 792];
