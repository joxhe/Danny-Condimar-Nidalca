import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { COP, fmtDate, todayISO } from '../domain';
import type { Informe } from '../domain/informes';
import { LOGOS } from './logos';

/** Informe de ventas en carta. Igual que el pedido: Courier, sin fuentes remotas. */
const s = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Courier', fontSize: 8 },
  encabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: '#111',
    paddingBottom: 4,
    marginBottom: 8,
  },
  titulo: { fontFamily: 'Courier-Bold', fontSize: 13 },
  bloqueMarca: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logos: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chico: { fontSize: 7.5, lineHeight: 1.4 },
  derecha: { textAlign: 'right' },
  cabeceraTabla: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111',
    paddingBottom: 2,
    fontFamily: 'Courier-Bold',
  },
  fila: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    borderBottomStyle: 'dotted',
    paddingVertical: 2.5,
  },
  colLinea: { width: 62 },
  colCategoria: { width: 96, paddingRight: 4 },
  colArticulo: { flex: 1, paddingRight: 4 },
  colCant: { width: 38, textAlign: 'right' },
  colDinero: { width: 66, textAlign: 'right' },
  granTotal: {
    flexDirection: 'row',
    borderTopWidth: 1.5,
    borderTopColor: '#111',
    paddingTop: 4,
    marginTop: 2,
    fontFamily: 'Courier-Bold',
  },
  pie: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#111',
    paddingTop: 3,
    fontSize: 7,
  },
});

const NOMBRE_LINEA = {
  todas: 'Condimar y Nidalca',
  CONDIMAR: 'Condimar',
  NIDALCA: 'Nidalca',
} as const;

export function InformePDF({ informe }: { informe: Informe }) {
  const { filas, granTotales, cantPedidos, desde, hasta, linea } = informe;

  return (
    <Document title={`Informe de ventas ${desde} a ${hasta}`} creator="Pedidos Condimar / Nidalca">
      <Page size="LETTER" style={s.page}>
        <View fixed>
          <View style={s.encabezado}>
            <View style={s.bloqueMarca}>
              {/* El informe puede abarcar las dos lineas: se muestran las que aplican. */}
              <View style={s.logos}>
                {(linea === 'todas' || linea === 'CONDIMAR') && (
                  <Image
                    src={LOGOS.CONDIMAR.src}
                    style={{ width: LOGOS.CONDIMAR.ancho, height: LOGOS.CONDIMAR.alto }}
                  />
                )}
                {(linea === 'todas' || linea === 'NIDALCA') && (
                  <Image
                    src={LOGOS.NIDALCA.src}
                    style={{ width: LOGOS.NIDALCA.ancho, height: LOGOS.NIDALCA.alto }}
                  />
                )}
              </View>
              <View>
              <Text style={s.titulo}>Informe de ventas</Text>
              <Text style={s.chico}>Linea: {NOMBRE_LINEA[linea]}</Text>
              <Text style={s.chico}>
                Periodo: {fmtDate(desde)} - {fmtDate(hasta)}
              </Text>
              </View>
            </View>
            <View style={s.derecha}>
              <Text style={s.chico}>Generado: {fmtDate(todayISO())}</Text>
              <Text style={s.chico}>{cantPedidos} pedido(s)</Text>
              <Text
                style={s.chico}
                render={({ pageNumber, totalPages }) =>
                  `Pag. ${pageNumber} de ${totalPages}`
                }
              />
            </View>
          </View>

          <View style={s.cabeceraTabla}>
            <Text style={s.colLinea}>Linea</Text>
            <Text style={s.colCategoria}>Categoria</Text>
            <Text style={s.colArticulo}>Articulo</Text>
            <Text style={s.colCant}>Cant.</Text>
            <Text style={s.colDinero}>Bruto</Text>
            <Text style={s.colDinero}>Desc.</Text>
            <Text style={s.colDinero}>Neto</Text>
          </View>
        </View>

        {filas.map((f) => (
          <View key={`${f.linea}|${f.categoria}|${f.producto}`} style={s.fila} wrap={false}>
            <Text style={s.colLinea}>{f.linea}</Text>
            <Text style={s.colCategoria}>{f.categoria}</Text>
            <Text style={s.colArticulo}>{f.producto}</Text>
            <Text style={s.colCant}>{f.cantidad}</Text>
            <Text style={s.colDinero}>{COP(f.bruto)}</Text>
            <Text style={s.colDinero}>{COP(f.descuento)}</Text>
            <Text style={s.colDinero}>{COP(f.neto)}</Text>
          </View>
        ))}

        <View style={s.granTotal} wrap={false}>
          <Text style={{ flex: 1 }}>TOTAL GENERAL</Text>
          <Text style={s.colCant}>{granTotales.cantidad}</Text>
          <Text style={s.colDinero}>{COP(granTotales.bruto)}</Text>
          <Text style={s.colDinero}>{COP(granTotales.descuento)}</Text>
          <Text style={s.colDinero}>{COP(granTotales.neto)}</Text>
        </View>

        <View style={s.pie} fixed>
          <Text>Informe de ventas</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Pag. ${pageNumber}/${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
