import { useMemo, useState } from 'react';
import {
  useCatalogos,
  useGuardarInforme,
  usePedidos,
  usePlaneacion,
} from '../../api/queries';
import { ListadoEsqueleto } from '../../components/Esqueleto';
import { IconoPdf } from '../../components/Iconos';
import { COP, construirInformeSemanal, fmtDate, informeAFilasDeHoja } from '../../domain';
import type { FilaInforme, InformeSemanal } from '../../domain/informeSemanal';
import type { Pedido, Producto } from '../../domain/types';
import { toast } from '../../store/toast';

const cargarPdf = () => import('../../pdf/generar');

/**
 * Completa la referencia y el embalaje de los renglones que no los traen.
 *
 * Hace falta por dos motivos. Uno historico: los pedidos guardados antes de
 * que el script escribiera `referencia_id` quedaron con el campo vacio, y sin
 * el no se pueden atribuir a ninguna fila del Informe. Y uno permanente: si a
 * un articulo le cambian la referencia en la hoja, los pedidos viejos deben
 * contarse con la referencia vigente, no con la que tenian al emitirse.
 *
 * El precio NO se toca: ese si se congela al emitir, porque el documento ya
 * se entrego con ese importe.
 */
function completarReferencias(pedidos: Pedido[], productos: Producto[]): Pedido[] {
  const porNombre = new Map(productos.map((p) => [p.producto.trim().toUpperCase(), p]));

  return pedidos.map((pedido) => ({
    ...pedido,
    items: pedido.items.map((item) => {
      if (item.referenciaId) return item;

      const producto = porNombre.get(item.producto.trim().toUpperCase());
      if (!producto) return item;

      return item.linea === 'CONDIMAR' && producto.linea === 'CONDIMAR'
        ? { ...item, referenciaId: producto.referenciaId, embalaje: producto.embalaje }
        : { ...item, referenciaId: producto.referenciaId };
    }),
  }));
}

/** Cajas con decimales solo cuando los tiene: "2" y no "2,0". */
const CAJAS = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');

const PCT = (v: number | null) => (v === null ? '—' : (v * 100).toFixed(1) + '%');

const valor = (f: FilaInforme, n: number) => (f.unidad === 'pesos' ? COP(n) : CAJAS(n));

export function InformeTab() {
  const { data: catalogos, isLoading: cargandoCat } = useCatalogos();
  const { data: pedidos = [], isLoading: cargandoPed } = usePedidos();
  const { data: planeacion, isLoading: cargandoPlan } = usePlaneacion();
  const guardar = useGuardarInforme();

  const [corteId, setCorteId] = useState<string>('');
  const [generando, setGenerando] = useState(false);

  const cortes = useMemo(
    () =>
      [...(planeacion?.cortes ?? [])].sort(
        (a, b) => a.anio - b.anio || a.mes - b.mes || a.semana - b.semana,
      ),
    [planeacion],
  );

  // Sin eleccion explicita, el ultimo corte: es el que se esta armando.
  const corte = cortes.find((c) => c.id === corteId) ?? cortes[cortes.length - 1];

  const informe = useMemo<InformeSemanal | null>(() => {
    if (!corte || !planeacion) return null;
    const todosLosProductos = [
      ...catalogos.productos.CONDIMAR,
      ...catalogos.productos.NIDALCA,
    ];
    return construirInformeSemanal({
      corte,
      cortes,
      pedidos: completarReferencias(pedidos, todosLosProductos),
      referencias: catalogos.referencias,
      presupuestos: planeacion.presupuestos,
    });
  }, [corte, cortes, pedidos, catalogos, planeacion]);

  /** Abre el PDF en otra pestaña: es la hoja tal como se va a entregar. */
  async function vistaPrevia() {
    if (!informe) return;
    setGenerando(true);
    try {
      const pdf = await cargarPdf();
      pdf.previsualizar(await pdf.informeSemanalABlob(informe));
    } catch (e) {
      toast.error('No se pudo generar la vista previa: ' + (e as Error).message);
    } finally {
      setGenerando(false);
    }
  }

  async function exportarPdf() {
    if (!informe) return;
    setGenerando(true);
    try {
      const pdf = await cargarPdf();
      const blob = await pdf.informeSemanalABlob(informe);
      await pdf.entregar(blob, pdf.nombreInformeSemanal(informe));
    } catch (e) {
      toast.error('No se pudo generar el PDF: ' + (e as Error).message);
    } finally {
      setGenerando(false);
    }
  }

  async function publicarEnHoja() {
    if (!informe) return;
    try {
      await guardar.mutateAsync({
        corteId: informe.corte.id,
        filas: informeAFilasDeHoja(informe),
      });
      toast.ok('Informe escrito en la hoja de cálculo.');
    } catch (e) {
      toast.error('No se pudo guardar: ' + (e as Error).message);
    }
  }

  if (cargandoCat || cargandoPed || cargandoPlan) return <ListadoEsqueleto filas={10} />;

  if (!corte) {
    return (
      <div className="tarjeta">
        <div className="vacio">
          No hay cortes definidos. Agregue filas a la pestaña <code>cortes</code> de la hoja.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="tarjeta">
        <div className="barra-herramientas">
          <div>
            <div className="tarjeta-titulo" style={{ marginBottom: 2 }}>
              Informe — {corte.titulo}
            </div>
            <div className="item-categoria">
              Del {fmtDate(informe!.desde)} al {fmtDate(informe!.hasta)} ·{' '}
              {informe!.pedidosContados} pedido(s) en la semana
            </div>
          </div>

          <div className="filtros">
            <select value={corte.id} onChange={(e) => setCorteId(e.target.value)}>
              {cortes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.titulo}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secundario"
              onClick={vistaPrevia}
              disabled={generando}
            >
              {generando ? 'Generando…' : 'Vista previa'}
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={publicarEnHoja}
              disabled={guardar.isPending}
            >
              {guardar.isPending ? 'Guardando…' : 'Escribir en la hoja'}
            </button>
            <button
              type="button"
              className="btn-primario"
              onClick={exportarPdf}
              disabled={generando}
            >
              <span className="boton-con-icono">
                <IconoPdf />
                {generando ? 'Generando…' : 'PDF'}
              </span>
            </button>
          </div>
        </div>

        <div className="tabla-scroll">
          <table className="informe">
            <thead>
              <tr>
                <th>Referencia</th>
                <th>Acum. anterior</th>
                <th>Ventas semana</th>
                <th>Nuevo acumulado</th>
                <th>Presupuesto</th>
                <th>% cumpl.</th>
                <th>Falta</th>
              </tr>
            </thead>
            <tbody>
              {informe!.filas.map((f) => (
                <Fila key={f.linea + f.referenciaId} f={f} />
              ))}
              <Fila f={informe!.granTotal} gran />
            </tbody>
          </table>
        </div>
      </div>

    </>
  );
}

function Fila({ f, gran }: { f: FilaInforme; gran?: boolean }) {
  const clase = gran ? 'fila-gran-total' : f.esTotal ? 'fila-total' : '';

  return (
    <tr className={clase}>
      <td>{f.etiqueta}</td>
      <td className="num">{valor(f, f.acumAnterior)}</td>
      <td className="num destacado">{valor(f, f.ventasSemana)}</td>
      <td className="num">{valor(f, f.nuevoAcumulado)}</td>
      <td className="num apagado">{valor(f, f.presupuesto)}</td>
      <td className="num">
        {f.pctCumplimiento === null ? (
          <span className="apagado">—</span>
        ) : (
          <Cumplimiento pct={f.pctCumplimiento} />
        )}
      </td>
      <td className="num apagado">{valor(f, f.falta)}</td>
    </tr>
  );
}

/** Porcentaje con una barra detrás: el avance se ve antes de leerse. */
function Cumplimiento({ pct }: { pct: number }) {
  const lleno = Math.min(pct, 1) * 100;
  const tono = pct >= 1 ? 'bien' : pct >= 0.5 ? 'medio' : 'bajo';

  return (
    <span className={`cumplimiento cumplimiento-${tono}`}>
      <span className="cumplimiento-barra" style={{ width: `${lleno}%` }} aria-hidden />
      <span className="cumplimiento-texto">{PCT(pct)}</span>
    </span>
  );
}
