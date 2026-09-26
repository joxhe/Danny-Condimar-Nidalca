import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { COP, fmtDate, todayISO } from '../domain';
import type { FilaInforme, InformeSemanal } from '../domain/informeSemanal';
import { LOGOS } from './logos';

/**
 * El Informe tal como lo entrega el cliente a sus superiores.
 *
 * Conserva la tabla de la hoja de siempre, incluida la mezcla de unidades:
 * las filas de referencia van en cajas y las de total en pesos. Se marca con
 * un sufijo para que quien lo lea no tenga que adivinar.
 */
const CAJAS = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');

const valor = (f: FilaInforme, n: number) => (f.unidad === 'pesos' ? COP(n) : CAJAS(n));

const PCT = (v: number | null) => (v === null ? '-' : (v * 100).toFixed(1) + '%');

const s = StyleSheet.create({
  page: { padding: 30, fontFamily: 'Courier', fontSize: 7.5 },
  encabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: '#111',
    paddingBottom: 5,
    marginBottom: 8,
  },
  marca: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logos: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  titulo: { fontFamily: 'Courier-Bold', fontSize: 12 },
  chico: { fontSize: 7, lineHeight: 1.4 },
  derecha: { textAlign: 'right' },

  cabecera: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111',
    paddingBottom: 3,
    fontFamily: 'Courier-Bold',
  },
  fila: {
    flexDirection: 'row',
    borderBottomWidth: 0.4,
    borderBottomColor: '#bbb',
    paddingVertical: 2.6,
  },
  filaTotal: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#111',
    borderBottomWidth: 0.4,
    borderBottomColor: '#bbb',
    paddingVertical: 3.4,
    fontFamily: 'Courier-Bold',
    backgroundColor: '#f2efe8',
  },
  filaGran: {
    flexDirection: 'row',
    borderTopWidth: 1.5,
    borderTopColor: '#111',
    paddingVertical: 4.5,
    marginTop: 1,
    fontFamily: 'Courier-Bold',
    fontSize: 8.5,
  },

  colRef: { flex: 1, paddingRight: 4 },
  colNum: { width: 66, textAlign: 'right' },
  colPct: { width: 50, textAlign: 'right' },

  seccion: { fontFamily: 'Courier-Bold', fontSize: 9, marginTop: 12, marginBottom: 4 },
  filaComp: {
    flexDirection: 'row',
    borderBottomWidth: 0.4,
    borderBottomColor: '#bbb',
    paddingVertical: 3,
  },
  nota: { fontSize: 6.5, color: '#555', marginTop: 4, lineHeight: 1.4 },

  pie: {
    position: 'absolute',
    bottom: 18,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#111',
    paddingTop: 3,
    fontSize: 6.5,
  },
});

export function InformeSemanalPDF({ informe }: { informe: InformeSemanal }) {
  const { corte, desde, hasta, filas, granTotal } = informe;

  return (
    <Document title={`Informe ${corte.titulo}`} creator="Pedidos Condimar / Nidalca">
      <Page size="LETTER" orientation="landscape" style={s.page}>
        <View fixed>
          <View style={s.encabezado}>
            <View style={s.marca}>
              <View style={s.logos}>
                <Image
                  src={LOGOS.CONDIMAR.src}
                  style={{ width: LOGOS.CONDIMAR.ancho, height: LOGOS.CONDIMAR.alto }}
                />
                <Image
                  src={LOGOS.NIDALCA.src}
                  style={{ width: LOGOS.NIDALCA.ancho, height: LOGOS.NIDALCA.alto }}
                />
              </View>
              <View>
                <Text style={s.titulo}>RESUMEN DE VENTAS</Text>
                <Text style={s.chico}>{corte.titulo}</Text>
                <Text style={s.chico}>
                  Periodo: {fmtDate(desde)} al {fmtDate(hasta)}
                </Text>
              </View>
            </View>

            <View style={s.derecha}>
              <Text style={s.chico}>Generado: {fmtDate(todayISO())}</Text>
              <Text style={s.chico}>{informe.pedidosContados} pedido(s) en la semana</Text>
              <Text
                style={s.chico}
                render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} de ${totalPages}`}
              />
            </View>
          </View>

          <View style={s.cabecera}>
            <Text style={s.colRef}>REFERENCIA</Text>
            <Text style={s.colNum}>ACUM. ANT.</Text>
            <Text style={s.colNum}>VTAS SEMANA</Text>
            <Text style={s.colNum}>NUEVO ACUM.</Text>
            <Text style={s.colNum}>PRESUPUESTO</Text>
            <Text style={s.colPct}>% CUMPL</Text>
            <Text style={s.colNum}>FALTA</Text>
          </View>
        </View>

        {filas.map((f) => (
          <Renglon key={f.linea + f.referenciaId} f={f} />
        ))}

        <View style={s.filaGran} wrap={false}>
          <Text style={s.colRef}>{granTotal.etiqueta}</Text>
          <Text style={s.colNum}>{valor(granTotal, granTotal.acumAnterior)}</Text>
          <Text style={s.colNum}>{valor(granTotal, granTotal.ventasSemana)}</Text>
          <Text style={s.colNum}>{valor(granTotal, granTotal.nuevoAcumulado)}</Text>
          <Text style={s.colNum}>{valor(granTotal, granTotal.presupuesto)}</Text>
          <Text style={s.colPct}>{PCT(granTotal.pctCumplimiento)}</Text>
          <Text style={s.colNum}>{valor(granTotal, granTotal.falta)}</Text>
        </View>

        <View wrap={false}>
          <Text style={s.nota}>
            Las filas de referencia estan en CAJAS; los totales, en PESOS. Solo se cuentan
            cajas completas: las unidades sueltas quedan pendientes para el corte siguiente.
          </Text>
        </View>

        <View style={s.pie} fixed>
          <Text>Resumen de ventas - {corte.titulo}</Text>
          <Text render={({ pageNumber, totalPages }) => `Pag. ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function Renglon({ f }: { f: FilaInforme }) {
  return (
    <View style={f.esTotal ? s.filaTotal : s.fila} wrap={false}>
      <Text style={s.colRef}>{f.etiqueta}</Text>
      <Text style={s.colNum}>{valor(f, f.acumAnterior)}</Text>
      <Text style={s.colNum}>{valor(f, f.ventasSemana)}</Text>
      <Text style={s.colNum}>{valor(f, f.nuevoAcumulado)}</Text>
      <Text style={s.colNum}>{valor(f, f.presupuesto)}</Text>
      <Text style={s.colPct}>{PCT(f.pctCumplimiento)}</Text>
      <Text style={s.colNum}>{valor(f, f.falta)}</Text>
    </View>
  );
}
