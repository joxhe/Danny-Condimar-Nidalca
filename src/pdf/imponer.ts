import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { CARTA } from './formatos';

/**
 * Imposicion: dos medias cartas por hoja carta.
 *
 * Para cuando se imprime en hojas carta enteras en vez de papel ya cortado.
 * Toma un PDF de medias cartas verticales (396 x 612) y arma otro de hojas
 * carta vertical (612 x 792): una media arriba, otra abajo, cada una girada
 * 90 grados para caber en su mitad, y una linea punteada para cortar. Al
 * cortar quedan dos tiras de media carta vertical, igual que el papel cortado.
 *
 * Por que se hace aqui y no en el dialogo de impresion: la opcion "paginas por
 * hoja" del navegador escala y rota segun su propio criterio, distinto en cada
 * navegador y en cada celular. Aqui la hoja ya sale armada y vertical, que es
 * como entra el papel carta a la impresora: no hay nada que rotar al imprimir.
 *
 * Las paginas se acomodan en orden, sin dejar huecos: si un pedido ocupa dos
 * medias hojas puede quedar repartido entre la mitad de abajo de una hoja y la
 * de arriba de la siguiente. Cada media lleva su "Pag. 1/2" en el pie, asi que
 * al cortarlas se reconocen igual.
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
 * Pone una media hoja en su mitad de la carta, sin deformarla.
 *
 * Cada mitad es horizontal (612 x 396). Una media carta vertical (396 x 612)
 * entra exacta si se gira 90 grados; una horizontal entraria derecha. Si
 * alguna llegara con otro tamaño se reduce lo justo para caber, centrada.
 */
function colocar(hoja: Hoja, media: Media, yInferior: number) {
  const vertical = media.height > media.width;

  // Medidas que ocupa en la hoja, ya girada si hace falta.
  const anchoEnHoja = vertical ? media.height : media.width;
  const altoEnHoja = vertical ? media.width : media.height;

  const escala = Math.min(1, CARTA[0] / anchoEnHoja, MITAD / altoEnHoja);
  const ancho = anchoEnHoja * escala;
  const alto = altoEnHoja * escala;
  const x = (CARTA[0] - ancho) / 2;
  const y = yInferior + (MITAD - alto) / 2;

  if (!vertical) {
    hoja.drawPage(media, { x, y, width: ancho, height: alto });
    return;
  }

  /*
   * Girada 90 grados antihorario sobre su esquina de origen, la pagina se
   * extiende hacia la IZQUIERDA de ese punto. Por eso el origen va en el borde
   * derecho de su lugar. El encabezado del pedido queda hacia la izquierda.
   */
  hoja.drawPage(media, {
    x: x + ancho,
    y,
    xScale: escala,
    yScale: escala,
    rotate: degrees(90),
  });
}
