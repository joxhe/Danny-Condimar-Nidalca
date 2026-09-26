import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { COP, EMPRESAS, calcularLinea, fmtDate, precioUnit } from '../domain';
import type { Pedido } from '../domain/types';
import { LOGOS } from './logos';

/**
 * Pedido en media carta (5.5 x 8.5 pulgadas = 396 x 612 puntos).
 *
 * Se usa Courier, una de las 14 fuentes estandar incrustadas en todo lector de
 * PDF: no hay descarga remota que pueda fallar ni que haya que esperar.
 *
 * La paginacion la resuelve el motor segun el alto real de cada renglon. Eso
 * reemplaza al corte fijo de 11 articulos por hoja de la version anterior, que
 * se desbordaba cuando los articulos traian observaciones.
 */
const MEDIA_CARTA: [number, number] = [396, 612];

const s = StyleSheet.create({
  page: { paddingVertical: 18, paddingHorizontal: 18, fontFamily: 'Courier', fontSize: 8 },
  encabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: '#111',
    paddingBottom: 4,
    marginBottom: 6,
  },
  marca: { fontFamily: 'Courier-Bold', fontSize: 12 },
  bloqueMarca: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chico: { fontSize: 7, lineHeight: 1.4 },
  derecha: { textAlign: 'right' },
  numero: { fontFamily: 'Courier-Bold', fontSize: 9 },
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
  colPrecio: { width: 56, textAlign: 'right' },
  colDesc: { width: 36, textAlign: 'right' },
  colSubtotal: { width: 64, textAlign: 'right' },
  observacion: { fontSize: 6.5, color: '#444' },
  totales: { marginTop: 8, alignSelf: 'flex-end', width: 210 },
  filaTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  filaSubtotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#111',
    borderBottomWidth: 0.5,
    borderBottomColor: '#111',
    paddingVertical: 2.5,
    marginVertical: 2,
    fontFamily: 'Courier-Bold',
  },
  filaGran: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1.5,
    borderTopColor: '#111',
    paddingTop: 3,
    marginTop: 2,
    fontFamily: 'Courier-Bold',
    fontSize: 9,
  },
  firmas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  firma: {
    width: 150,
    borderTopWidth: 0.5,
    borderTopColor: '#111',
    paddingTop: 2,
    fontSize: 7,
  },
  pie: {
    position: 'absolute',
    bottom: 10,
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#111',
    paddingTop: 3,
    fontSize: 6.5,
  },
});

export function PedidoPDF({ pedido }: { pedido: Pedido }) {
  const emp = EMPRESAS[pedido.linea];
  const logo = LOGOS[pedido.linea];
  const t = pedido.totales;

  return (
    <Document
      title={`Pedido ${pedido.numero} - ${emp.nombre}`}
      author={emp.nombre}
      creator="Pedidos Condimar / Nidalca"
    >
      <Page size={MEDIA_CARTA} style={s.page}>
        {/* fixed: encabezado, datos del cliente y cabecera de tabla en cada hoja */}
        <View fixed>
          <View style={s.encabezado}>
            <View style={s.bloqueMarca}>
              <Image src={logo.src} style={{ width: logo.ancho, height: logo.alto }} />
              <View>
                <Text style={s.marca}>{emp.nombre}</Text>
                <Text style={s.chico}>NIT {emp.nit}</Text>
                <Text style={s.chico}>{emp.direccion}</Text>
                <Text style={s.chico}>Tel: {emp.telefono}</Text>
              </View>
            </View>
            <View style={s.derecha}>
              <Text style={s.numero}>PEDIDO No. {pedido.numero}</Text>
              <Text style={s.chico}>Fecha: {fmtDate(pedido.fecha)}</Text>
              <Text
                style={s.chico}
                render={({ pageNumber, totalPages }) =>
                  `Pag. ${pageNumber} de ${totalPages}`
                }
              />
            </View>
          </View>

          <View style={s.cliente}>
            <Text>
              <Text style={s.etiqueta}>Cliente: </Text>
              {pedido.cliente?.razon_social}
            </Text>
            <Text>
              <Text style={s.etiqueta}>NIT/CC: </Text>
              {pedido.cliente?.nit}
              <Text style={s.etiqueta}>{'   Ciudad: '}</Text>
              {pedido.cliente?.ciudad}
            </Text>
            <Text>
              <Text style={s.etiqueta}>Direccion: </Text>
              {pedido.cliente?.direccion}
              <Text style={s.etiqueta}>{'   Tel: '}</Text>
              {pedido.cliente?.telefono}
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

        {/* Sin fixed: fluye detras del ultimo renglon, o sea en la ultima hoja */}
        <View style={s.totales} wrap={false}>
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
          <View style={{ marginTop: 8 }} wrap={false}>
            <Text style={s.chico}>
              <Text style={s.etiqueta}>Observaciones: </Text>
              {pedido.obsGenerales}
            </Text>
          </View>
        )}

        <View style={s.firmas} wrap={false}>
          <Text style={s.firma}>Firma vendedor</Text>
          <Text style={s.firma}>Firma cliente</Text>
        </View>

        <View style={s.pie} fixed>
          <Text>{emp.nombre}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Pedido No. ${pedido.numero} - Pag. ${pageNumber}/${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
