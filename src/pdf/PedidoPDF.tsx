import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { COP, EMPRESAS, calcularLinea, fmtDate, precioUnit } from '../domain';
import type { Pedido } from '../domain/types';
import { MEDIA_CARTA } from './formatos';
import { LOGOS } from './logos';

/**
 * Pedido en media carta VERTICAL: 5,5 x 8,5 pulgadas = 396 x 612 puntos.
 *
 * Es la forma de la media hoja tal como entra a la impresora, por el lado
 * angosto. Una primera version fue horizontal para aprovechar mejor el alto
 * con pedidos cortos, pero la impresora no la roto y corto toda la columna
 * izquierda: logo, cliente y nombres de articulo. Pagina igual al papel es lo
 * unico que no depende de como interprete cada driver la orientacion.
 *
 * Se usa Courier, una de las 14 fuentes estandar incrustadas en todo lector de
 * PDF: no hay descarga remota que pueda fallar ni que haya que esperar.
 *
 * La paginacion la resuelve el motor segun el alto real de cada renglon. Un
 * pedido largo sigue en otra media hoja, con el encabezado repetido.
 */

/**
 * Margen lateral de 0,3 pulgadas. Casi todas las impresoras dejan sin tinta
 * los primeros 4 a 6 mm del borde: con menos margen, imprimir al 100 % en
 * media carta cortaria la columna de subtotales o el logo.
 */
const MARGEN = 22;

const s = StyleSheet.create({
  page: {
    paddingTop: 22,
    paddingBottom: 36,
    paddingHorizontal: MARGEN,
    fontFamily: 'Courier',
    fontSize: 8,
  },

  encabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#111',
    paddingBottom: 5,
    marginBottom: 6,
  },
  bloqueMarca: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  marca: { fontFamily: 'Courier-Bold', fontSize: 11 },
  chico: { fontSize: 6.8, lineHeight: 1.35 },
  derecha: { textAlign: 'right' },
  numero: { fontFamily: 'Courier-Bold', fontSize: 10 },

  cliente: { marginBottom: 6, fontSize: 7.5, lineHeight: 1.5 },
  etiqueta: { fontFamily: 'Courier-Bold' },

  cabeceraTabla: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111',
    paddingBottom: 2,
    fontFamily: 'Courier-Bold',
  },
  filaTabla: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    borderBottomStyle: 'dotted',
    paddingVertical: 2.5,
  },
  colArticulo: { flex: 1, paddingRight: 4 },
  colCant: { width: 30, textAlign: 'right' },
  colPrecio: { width: 54, textAlign: 'right' },
  colDesc: { width: 34, textAlign: 'right' },
  colSubtotal: { width: 62, textAlign: 'right' },
  observacion: { fontSize: 6.5, color: '#444' },

  totales: { marginTop: 8, alignSelf: 'flex-end', width: 214 },
  filaTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.4 },
  filaSubtotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#111',
    borderBottomWidth: 0.5,
    borderBottomColor: '#111',
    paddingVertical: 2.2,
    marginVertical: 1.5,
    fontFamily: 'Courier-Bold',
  },
  filaGran: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1.5,
    borderTopColor: '#111',
    paddingTop: 2.5,
    marginTop: 1.5,
    fontFamily: 'Courier-Bold',
    fontSize: 9,
  },

  observaciones: { marginTop: 8, fontSize: 7, lineHeight: 1.4 },
  firmas: { flexDirection: 'row', gap: 22, marginTop: 30 },
  firma: {
    flex: 1,
    borderTopWidth: 0.5,
    borderTopColor: '#111',
    paddingTop: 2,
    fontSize: 7,
  },

  pie: {
    position: 'absolute',
    bottom: 18,
    left: MARGEN,
    right: MARGEN,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#111',
    paddingTop: 2.5,
    fontSize: 6.5,
  },
});

/** Un pedido como una o mas medias cartas. Se compone dentro de un Document. */
export function PaginaPedido({ pedido }: { pedido: Pedido }) {
  const emp = EMPRESAS[pedido.linea];
  const logo = LOGOS[pedido.linea];
  const t = pedido.totales;
  const c = pedido.cliente;

  return (
    <Page size={MEDIA_CARTA} style={s.page}>
      {/* fixed: encabezado, cliente y cabecera de tabla en cada media hoja */}
      <View fixed>
        <View style={s.encabezado}>
          <View style={s.bloqueMarca}>
            <Image src={logo.src} style={{ width: logo.ancho, height: logo.alto }} />
            <View>
              <Text style={s.marca}>{emp.nombre}</Text>
              <Text style={s.chico}>NIT {emp.nit}</Text>
              <Text style={s.chico}>
                {emp.direccion} · Tel: {emp.telefono}
              </Text>
            </View>
          </View>
          <View style={s.derecha}>
            <Text style={s.numero}>PEDIDO No. {pedido.numero}</Text>
            <Text style={s.chico}>Fecha: {fmtDate(pedido.fecha)}</Text>
          </View>
        </View>

        <View style={s.cliente}>
          <Text>
            <Text style={s.etiqueta}>Cliente: </Text>
            {c?.razon_social}
          </Text>
          <Text>
            <Text style={s.etiqueta}>NIT/CC: </Text>
            {c?.nit}
            <Text style={s.etiqueta}>{'   Tel: '}</Text>
            {c?.telefono}
          </Text>
          <Text>
            <Text style={s.etiqueta}>Direccion: </Text>
            {c?.direccion}
            <Text style={s.etiqueta}>{'   Ciudad: '}</Text>
            {c?.ciudad}
          </Text>
        </View>

        <View style={s.cabeceraTabla}>
          <Text style={s.colArticulo}>Articulo</Text>
          <Text style={s.colCant}>Cant</Text>
          <Text style={s.colPrecio}>Precio</Text>
          <Text style={s.colDesc}>Desc%</Text>
          <Text style={s.colSubtotal}>Subtotal</Text>
        </View>
      </View>

      {pedido.items.map((item) => {
        const l = calcularLinea(item);
        return (
          <View key={item.lineId} style={s.filaTabla} wrap={false}>
            <View style={s.colArticulo}>
              <Text>{item.producto}</Text>
              {!!item.observaciones && (
                <Text style={s.observacion}>{item.observaciones}</Text>
              )}
            </View>
            <Text style={s.colCant}>{item.cantidad}</Text>
            <Text style={s.colPrecio}>{COP(precioUnit(item))}</Text>
            <Text style={s.colDesc}>{item.descuentoPct || 0}%</Text>
            <Text style={s.colSubtotal}>{COP(l.bruto - l.descuento)}</Text>
          </View>
        );
      })}

      {/* Sin fixed: fluye detras del ultimo renglon, o sea en la ultima media hoja */}
      <View wrap={false}>
        <View style={s.totales}>
          <View style={s.filaTotal}>
            <Text>Valor antes de descuento</Text>
            <Text>{COP(t.bruto)}</Text>
          </View>
          <View style={s.filaTotal}>
            <Text>Valor del descuento</Text>
            <Text>-{COP(t.descuento)}</Text>
          </View>
          {/* Subtotal: bruto menos descuento, antes de impuestos. */}
          <View style={s.filaSubtotal}>
            <Text>SUBTOTAL</Text>
            <Text>{COP(t.subtotal)}</Text>
          </View>
          <View style={s.filaTotal}>
            <Text>Valor del impuesto (IVA)</Text>
            <Text>{COP(t.iva)}</Text>
          </View>
          <View style={s.filaTotal}>
            <Text>Valor del ICUI</Text>
            <Text>{COP(t.icui)}</Text>
          </View>
          <View style={s.filaGran}>
            <Text>TOTAL A CANCELAR</Text>
            <Text>{COP(t.total)}</Text>
          </View>
        </View>

        {!!pedido.obsGenerales && (
          <Text style={s.observaciones}>
            <Text style={s.etiqueta}>Observaciones: </Text>
            {pedido.obsGenerales}
          </Text>
        )}

        <View style={s.firmas}>
          <Text style={s.firma}>Firma vendedor</Text>
          <Text style={s.firma}>Firma cliente</Text>
        </View>
      </View>

      {/*
        La numeracion va solo en el pie. En el encabezado nunca se llego a
        dibujar: el texto dinamico dentro de una columna alineada a la derecha
        se mide vacio en la primera pasada y queda sin ancho.

        `subPageNumber` cuenta las hojas de ESTE pedido y no las del documento:
        al imprimir varios juntos, el tercero dice "Pag. 1/1" y no "Pag. 3/5".
      */}
      <View style={s.pie} fixed>
        <Text>{emp.nombre}</Text>
        <Text
          render={({ subPageNumber, subPageTotalPages }) =>
            `Pedido No. ${pedido.numero} - Pag. ${subPageNumber}/${subPageTotalPages}`
          }
        />
      </View>
    </Page>
  );
}

/** Un solo pedido: es el que se comparte por WhatsApp o se descarga. */
export function PedidoPDF({ pedido }: { pedido: Pedido }) {
  const emp = EMPRESAS[pedido.linea];
  return (
    <Document
      title={`Pedido ${pedido.numero} - ${emp.nombre}`}
      author={emp.nombre}
      creator="Pedidos Condimar / Nidalca"
    >
      <PaginaPedido pedido={pedido} />
    </Document>
  );
}

/**
 * Varios pedidos en un mismo documento, cada uno empezando en su propia media
 * hoja. Para papel ya cortado se imprime tal cual; para hojas carta enteras se
 * acomoda despues de a dos por hoja (ver `imponer.ts`).
 */
export function PedidosPDF({ pedidos }: { pedidos: Pedido[] }) {
  return (
    <Document title={`Pedidos (${pedidos.length})`} creator="Pedidos Condimar / Nidalca">
      {pedidos.map((p) => (
        <PaginaPedido key={p.id} pedido={p} />
      ))}
    </Document>
  );
}
