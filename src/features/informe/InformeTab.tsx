import { useMemo, useState } from 'react';
import {
  useCatalogos,
  useGuardarAjustes,
  useGuardarInforme,
  usePedidos,
  usePlaneacion,
} from '../../api/queries';
import { CalendarioIntervalo } from '../../components/CalendarioIntervalo';
import { CampoNumero } from '../../components/CampoNumero';
import { ListadoEsqueleto } from '../../components/Esqueleto';
import { IconoCalendario, IconoCompartir, IconoPdf } from '../../components/Iconos';
import {
  COP,
  ajustesEditados,
  aplicarAjustes,
  construirInformeSemanal,
  diasDelPeriodo,
  idPeriodo,
  informeAFilasDeHoja,
  mismoMes,
  semanaDe,
  todayISO,
  type Escrito,
  type Periodo,
} from '../../domain';
import type { FilaInforme, InformeSemanal } from '../../domain/informeSemanal';
import type { Ajuste, Pedido, Producto } from '../../domain/types';
import { compartirPdf, guardarPdf, nombreInformeSemanal, puedeCompartir } from '../../pdf/entrega';
import { toast } from '../../store/toast';

const cargarPdf = () => import('../../pdf/generar');

/*
 * El periodo elegido se recuerda mientras la pestaña del navegador siga
 * abierta: al ir a Pedidos y volver, el Informe sigue en las mismas fechas.
 * Al abrir la app otro dia arranca de nuevo en la semana actual.
 */
const CLAVE_PERIODO = 'informe_periodo';
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function periodoGuardado(): Periodo | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(CLAVE_PERIODO) ?? 'null');
    const valido =
      FECHA_ISO.test(p?.desde) &&
      FECHA_ISO.test(p?.hasta) &&
      p.desde <= p.hasta &&
      mismoMes(p.desde, p.hasta);
    return valido ? { desde: p.desde, hasta: p.hasta } : null;
  } catch {
    // Sin almacenamiento disponible: se usa la semana actual.
    return null;
  }
}

function guardarPeriodo(p: Periodo) {
  try {
    sessionStorage.setItem(CLAVE_PERIODO, JSON.stringify(p));
  } catch {
    // Solo se pierde el recuerdo del periodo, no el informe.
  }
}

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

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

/** Identidad de una fila de la tabla, para guardar lo que se escribe en ella. */
const claveFila = (f: FilaInforme) => `${f.linea}|${f.referenciaId}`;

export function InformeTab() {
  const { data: catalogos, isLoading: cargandoCat } = useCatalogos();
  const { data: pedidos = [], isLoading: cargandoPed } = usePedidos();
  const { data: planeacion, isLoading: cargandoPlan } = usePlaneacion();
  const guardar = useGuardarInforme();
  const guardarAjustes = useGuardarAjustes();

  const hoy = todayISO();
  // Abre en la semana actual, de lunes a sabado, salvo que ya se haya elegido otro.
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoGuardado() ?? semanaDe(hoy));
  const [eligiendo, setEligiendo] = useState(false);
  const [generando, setGenerando] = useState(false);
  /** Modo correccion: el acumulado anterior y las devoluciones se pueden escribir. */
  const [ajustando, setAjustando] = useState(false);
  const [escritos, setEscritos] = useState<Record<string, Escrito>>({});
  const [compartible] = useState(puedeCompartir);

  function salirDeAjustes() {
    setAjustando(false);
    setEscritos({});
  }

  function elegir(p: Periodo) {
    setPeriodo(p);
    guardarPeriodo(p);
    setEligiendo(false);
    // Lo escrito era para el periodo anterior.
    salirDeAjustes();
  }

  const pedidosCompletos = useMemo(
    () =>
      completarReferencias(pedidos, [
        ...catalogos.productos.CONDIMAR,
        ...catalogos.productos.NIDALCA,
      ]),
    [pedidos, catalogos],
  );

  const armar = (ajustes: Ajuste[]): InformeSemanal | null =>
    planeacion
      ? construirInformeSemanal({
          periodo,
          pedidos: pedidosCompletos,
          referencias: catalogos.referencias,
          presupuestos: planeacion.presupuestos,
          ajustes,
        })
      : null;

  /** El Informe con los ajustes ya guardados en la hoja. */
  const guardado = useMemo(
    () => armar(planeacion?.ajustes ?? []),
    // `armar` se recrea en cada render; lo que cambia el resultado es esto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodo, pedidosCompletos, catalogos.referencias, planeacion],
  );

  /** Lo escrito en la tabla, traducido a ajustes. Vacio si no se toco nada. */
  const cambios = useMemo(() => {
    if (!guardado || !planeacion) return [];
    return guardado.filas.flatMap((f) => {
      const e = escritos[claveFila(f)];
      return e ? ajustesEditados(f, periodo, e, planeacion.ajustes) : [];
    });
  }, [guardado, escritos, periodo, planeacion]);

  // Mientras se ajusta, la tabla ya muestra el resultado de lo escrito.
  const informe = useMemo(
    () => (cambios.length ? armar(aplicarAjustes(planeacion?.ajustes ?? [], cambios)) : guardado),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guardado, cambios],
  );

  /** Para marcar en el calendario los dias en que hubo ventas. */
  const diasConVentas = useMemo(
    () => new Set(pedidos.filter((p) => p.estado === 'finalizado').map((p) => p.fecha)),
    [pedidos],
  );

  async function guardarCambios() {
    if (!cambios.length) return salirDeAjustes();
    try {
      await guardarAjustes.mutateAsync(cambios);
      toast.ok(`${cambios.length} ajuste(s) guardado(s).`);
      salirDeAjustes();
    } catch (e) {
      const m = (e as Error).message;
      toast.error(
        /desconocida/i.test(m)
          ? 'La hoja todavía no acepta ajustes: falta publicar la versión 1.8.0 del Apps Script.'
          : 'No se pudieron guardar los ajustes: ' + m,
      );
    }
  }

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

  /** Pregunta en que carpeta guardarlo, en PC y en celular. */
  async function exportarPdf() {
    if (!informe) return;
    const actual = informe;
    setGenerando(true);
    try {
      const r = await guardarPdf(nombreInformeSemanal(actual), async () =>
        (await cargarPdf()).informeSemanalABlob(actual),
      );
      if (r === 'guardado') toast.ok('Informe guardado en PDF.');
    } catch (e) {
      toast.error('No se pudo generar el PDF: ' + (e as Error).message);
    } finally {
      setGenerando(false);
    }
  }

  async function compartir() {
    if (!informe) return;
    const actual = informe;
    setGenerando(true);
    try {
      await compartirPdf(nombreInformeSemanal(actual), async () =>
        (await cargarPdf()).informeSemanalABlob(actual),
      );
    } catch (e) {
      toast.error('No se pudo compartir: ' + (e as Error).message);
    } finally {
      setGenerando(false);
    }
  }

  async function publicarEnHoja() {
    if (!informe) return;
    try {
      await guardar.mutateAsync({
        corteId: idPeriodo(informe),
        filas: informeAFilasDeHoja(informe),
      });
      toast.ok('Informe escrito en la hoja de cálculo.');
    } catch (e) {
      toast.error('No se pudo guardar: ' + (e as Error).message);
    }
  }

  if (cargandoCat || cargandoPed || cargandoPlan) return <ListadoEsqueleto filas={10} />;

  // Sin la planeacion no hay presupuestos contra que medir.
  if (!informe) {
    return (
      <div className="tarjeta">
        <div className="vacio">
          No se pudo cargar el presupuesto. Revisa la conexión y vuelve a abrir el Informe.
        </div>
      </div>
    );
  }

  const dias = diasDelPeriodo(informe);
  const hayAjusteInicial = informe.filas.some((f) => f.ajusteInicial !== 0);

  function escribir(f: FilaInforme, campo: keyof Escrito, n: number) {
    const k = claveFila(f);
    setEscritos((prev) => ({ ...prev, [k]: { ...prev[k], [campo]: n } }));
  }

  return (
    <>
      <div className="tarjeta">
        <div className="barra-herramientas">
          <div>
            <div className="tarjeta-titulo" style={{ marginBottom: 'var(--e2)' }}>
              Informe
            </div>
            <button
              type="button"
              className="selector-periodo"
              aria-expanded={eligiendo}
              onClick={() => setEligiendo((v) => !v)}
            >
              <IconoCalendario tamano={18} />
              <span>{conMayuscula(informe.titulo)}</span>
              <span className="selector-periodo-flecha" aria-hidden="true">
                ▾
              </span>
            </button>
            <div className="item-categoria" style={{ marginTop: 'var(--e1)' }}>
              {dias} {dias === 1 ? 'día' : 'días'} · {informe.pedidosContados} pedido(s) en el
              periodo · todas las ciudades
            </div>

            {/* Justo debajo del boton que lo abre, tambien en el celular, donde
                los botones de la derecha pasan abajo. Escape lo cierra. */}
            {eligiendo && (
              <div onKeyDown={(e) => e.key === 'Escape' && setEligiendo(false)}>
                <CalendarioIntervalo
                  periodo={periodo}
                  hoy={hoy}
                  conVentas={diasConVentas}
                  onElegir={elegir}
                />
              </div>
            )}
          </div>

          <div className="filtros">
            {ajustando ? (
              <>
                <button type="button" className="btn-fantasma" onClick={salirDeAjustes}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primario"
                  onClick={guardarCambios}
                  disabled={guardarAjustes.isPending}
                >
                  {guardarAjustes.isPending
                    ? 'Guardando…'
                    : cambios.length
                      ? `Guardar ${cambios.length} ajuste(s)`
                      : 'Listo'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={() => setAjustando(true)}
                  title="Corregir el acumulado anterior o registrar devoluciones"
                >
                  Ajustar
                </button>
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
                {compartible && (
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={compartir}
                    disabled={generando}
                  >
                    <span className="boton-con-icono">
                      <IconoCompartir />
                      Compartir
                    </span>
                  </button>
                )}
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
              </>
            )}
          </div>
        </div>

        {ajustando && (
          <p className="nota">
            <strong>Acum. anterior:</strong> si en el mes hubo ventas que no se registraron en
            la app, escribe el acumulado real. La diferencia se guarda y cuenta para todo el
            mes. <strong>Devoluciones:</strong> lo devuelto en este periodo. Se resta del nuevo
            acumulado y, en los periodos siguientes, del acumulado anterior. Las referencias van
            en cajas y los totales en pesos.
          </p>
        )}

        <div className="tabla-scroll">
          <table className="informe">
            <thead>
              <tr>
                <th>Referencia</th>
                <th>Acum. anterior</th>
                <th>Ventas semana</th>
                <th>Devoluciones</th>
                <th>Nuevo acumulado</th>
                <th>Presupuesto</th>
                <th>% cumpl.</th>
                <th>Falta</th>
              </tr>
            </thead>
            <tbody>
              {informe.filas.map((f) => (
                <Fila
                  key={claveFila(f)}
                  f={f}
                  onEscribir={ajustando ? (campo, n) => escribir(f, campo, n) : undefined}
                />
              ))}
              <Fila f={informe.granTotal} gran />
            </tbody>
          </table>
        </div>

        {hayAjusteInicial && !ajustando && (
          <p className="ayuda">* Incluye ventas del mes escritas a mano, que no están en la app.</p>
        )}
      </div>
    </>
  );
}

function Fila({
  f,
  gran,
  onEscribir,
}: {
  f: FilaInforme;
  gran?: boolean;
  /** Solo en modo ajustar. El gran total nunca se escribe: es la suma. */
  onEscribir?: (campo: keyof Escrito, n: number) => void;
}) {
  const clase = gran ? 'fila-gran-total' : f.esTotal ? 'fila-total' : '';

  return (
    <tr className={clase}>
      <td>{f.etiqueta}</td>
      <td className="num">
        {onEscribir ? (
          <CampoNumero
            valor={Math.round(f.acumAnterior)}
            etiqueta={`Acumulado anterior de ${f.etiqueta}`}
            onCambiar={(n) => onEscribir('acumAnterior', n)}
          />
        ) : (
          <>
            {valor(f, f.acumAnterior)}
            {!gran && f.ajusteInicial !== 0 && (
              <span
                className="marca-ajuste"
                title={`Incluye ${valor(f, f.ajusteInicial)} escrito a mano`}
              >
                *
              </span>
            )}
          </>
        )}
      </td>
      <td className="num destacado">{valor(f, f.ventasSemana)}</td>
      <td className="num">
        {onEscribir ? (
          <CampoNumero
            valor={Math.round(f.devoluciones)}
            etiqueta={`Devoluciones de ${f.etiqueta}`}
            onCambiar={(n) => onEscribir('devoluciones', n)}
          />
        ) : f.devoluciones ? (
          <span className="negativo">−{valor(f, f.devoluciones)}</span>
        ) : (
          <span className="apagado">—</span>
        )}
      </td>
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
