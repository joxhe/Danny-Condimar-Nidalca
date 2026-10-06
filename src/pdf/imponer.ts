import { PDFDocument, rgb } from 'pdf-lib';
import { CARTA } from './formatos';

/**
 * Imposicion: dos medias cartas por hoja carta.
 *
 * Toma un PDF de paginas media carta horizontal (612 x 396) y arma otro de
 * hojas carta vertical (612 x 792), con una media arriba y otra abajo y una
 * linea punteada para cortar.
 *
 * Por que se hace aqui y no en el dialogo de impresion: la opcion "paginas por
 * hoja" del navegador escala y rota segun su propio criterio, distinto en cada
 * navegador y en cada celular. Aqui el resultado ya es una hoja carta con las
 * dos mitades al 100 %, y basta imprimirla tal cual.
 *
 * Las paginas se acomodan en orden, sin dejar huecos: si un pedido ocupa dos
 * medias hojas puede quedar repartido entre la mitad de abajo de una hoja y la
 * de arriba de la siguiente. Cada media lleva su "Pag. 1/2" en el pie, asi que al
 * cortarlas se reconocen igual.
 */

const MITAD = CARTA[1] / 2;

/** Gris suave: tiene que verse para cortar, pero no competir con el pedido. */
const GRIS_CORTE = rgb(0.6, 0.6, 0.6);

export async function imponerDosPorHoja(origen: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const fuente = await PDFDocument.load(origen);
  const total = fuente.getPageCount();

  const salida = await PDFDocument.create();
  salida.setTitle(fuente.getTitle() ?? 'Pedidos');
  salida.setCreator('Pedidos Condimar / Nidalca');

  const medias = await salida.embedPdf(
    fuente,
    Array.from({ length: total }, (_, i) => i),
  );

  for (let i = 0; i < medias.length; i += 2) {
    const hoja = salida.addPage(CARTA);

    // El origen de coordenadas de un PDF esta abajo a la izquierda.
    colocar(hoja, medias[i], MITAD);
    if (medias[i + 1]) colocar(hoja, medias[i + 1], 0);

    hoja.drawLine({
      start: { x: 14, y: MITAD },
      end: { x: CARTA[0] - 14, y: MITAD },
      thickness: 0.6,
      color: GRIS_CORTE,
      dashArray: [5, 4],
    });
  }

  return salida.save();
}

type Hoja = ReturnType<PDFDocument['addPage']>;
type Media = Awaited<ReturnType<PDFDocument['embedPdf']>>[number];

/**
 * Pone una media hoja en su mitad, sin deformarla.
 *
 * Las del sistema miden exactamente media carta y entran al 100 %. Si alguna
 * llegara con otro tamaño se reduce lo justo para caber, centrada.
 */
function colocar(hoja: Hoja, media: Media, y: number) {
  const escala = Math.min(1, CARTA[0] / media.width, MITAD / media.height);
  const ancho = media.width * escala;
  const alto = media.height * escala;

  hoja.drawPage(media, {
    x: (CARTA[0] - ancho) / 2,
    y: y + (MITAD - alto) / 2,
    width: ancho,
    height: alto,
  });
}
