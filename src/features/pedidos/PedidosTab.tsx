import { useMemo, useState } from 'react';
import { useEliminarPedido, useEliminarPedidos, usePedidos } from '../../api/queries';
import { ListadoEsqueleto } from '../../components/Esqueleto';
import {
  IconoBorrar,
  IconoCompartir,
  IconoEditar,
  IconoImprimir,
  IconoOjo,
  IconoPdf,
} from '../../components/Iconos';
import { COP, fmtDate } from '../../domain';
import type { EstadoPedido, Linea, Pedido } from '../../domain/types';
import { compartirPdf, guardarPdf, nombrePedido, puedeCompartir } from '../../pdf/entrega';
import { confirmar } from '../../store/dialogo';
import { usePedidoBorrador } from '../../store/pedidoBorrador';
import { toast } from '../../store/toast';

const cargarPdf = () => import('../../pdf/generar');

type Papel = 'media-carta' | 'carta-doble';

/*
 * El papel elegido se recuerda en este dispositivo: quien tiene resmas
 * cortadas a la mitad no deberia elegirlo cada vez. Si el almacenamiento no
 * esta disponible (navegacion privada) simplemente se usa media carta.
 */
const CLAVE_PAPEL = 'papel_impresion';

function papelGuardado(): Papel {
  try {
    return localStorage.getItem(CLAVE_PAPEL) === 'carta-doble' ? 'carta-doble' : 'media-carta';
  } catch {
    return 'media-carta';
  }
}

function guardarPapel(p: Papel) {
  try {
    localStorage.setItem(CLAVE_PAPEL, p);
  } catch {
    /* sin almacenamiento: se elige de nuevo la proxima vez */
  }
}

type FiltroEstado = EstadoPedido | 'todos';
type FiltroLinea = Linea | 'todas';

export function PedidosTab({ onEditar }: { onEditar: () => void }) {
  const { data: pedidos = [], isLoading } = usePedidos();
  const eliminar = useEliminarPedido();
  const eliminarVarios = useEliminarPedidos();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [papel, setPapel] = useState<Papel>(papelGuardado);
  const [imprimiendo, setImprimiendo] = useState(false);
  const cargarDesde = usePedidoBorrador((s) => s.cargarDesde);
  const tieneContenido = usePedidoBorrador((s) => s.tieneContenido);
  // En PC no se ofrece: la hoja de compartir de escritorio no sirve para esto.
  const [compartible] = useState(puedeCompartir);

  const [estado, setEstado] = useState<FiltroEstado>('todos');
  const [linea, setLinea] = useState<FiltroLinea>('todas');
  const [consulta, setConsulta] = useState('');

  const lista = useMemo(() => {
    const q = consulta.trim().toLowerCase();
    return pedidos
      .filter((p) => estado === 'todos' || p.estado === estado)
      .filter((p) => linea === 'todas' || p.linea === linea)
      .filter((p) => {
        if (!q) return true;
        const texto = `${p.numero} ${p.cliente?.razon_social ?? ''}`.toLowerCase();
        return texto.includes(q);
      })
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }, [pedidos, estado, linea, consulta]);

  async function editar(p: Pedido) {
    if (tieneContenido()) {
      const seguir = await confirmar({
        titulo: 'Hay un pedido a medias',
        mensaje: `Abrir el pedido No. ${p.numero} reemplaza el que se está armando ahora.`,
        confirmar: 'Abrir de todos modos',
      });
      if (!seguir) return;
    }
    cargarDesde(p);
    onEditar();
    toast.ok(`Pedido No. ${p.numero} abierto para editar.`);
  }

  /** Abre el PDF en otra pestaña, sin descargarlo ni compartirlo. */
  async function verPdf(p: Pedido) {
    try {
      const pdf = await cargarPdf();
      pdf.previsualizar(await pdf.pedidoABlob(p));
    } catch (e) {
      toast.error('No se pudo abrir la vista previa: ' + (e as Error).message);
    }
  }

  /** Pregunta en que carpeta guardarlo, en PC y en celular. */
  async function descargarPdf(p: Pedido) {
    try {
      const r = await guardarPdf(nombrePedido(p), async () =>
        (await cargarPdf()).pedidoABlob(p),
      );
      if (r === 'guardado') toast.ok(`Pedido No. ${p.numero} guardado en PDF.`);
    } catch (e) {
      toast.error('No se pudo generar el PDF: ' + (e as Error).message);
    }
  }

  async function compartir(p: Pedido) {
    try {
      await compartirPdf(nombrePedido(p), async () => (await cargarPdf()).pedidoABlob(p));
    } catch (e) {
      toast.error('No se pudo compartir: ' + (e as Error).message);
    }
  }

  function alternar(id: string) {
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  const visiblesMarcados = lista.filter((p) => marcados.has(p.id));
  const todosMarcados = lista.length > 0 && visiblesMarcados.length === lista.length;

  function alternarTodos() {
    setMarcados(todosMarcados ? new Set() : new Set(lista.map((p) => p.id)));
  }

  /**
   * Abre los marcados en un solo PDF, listo para mandar a la impresora.
   *
   * Se abre en otra pestaña y no se dispara el dialogo de impresion desde la
   * pagina: imprimir el PDF desde el visor del navegador es lo confiable. La
   * hoja en blanco de la app anterior salia justamente de imprimir el DOM.
   */
  async function imprimirMarcados() {
    if (!visiblesMarcados.length) return;
    setImprimiendo(true);
    try {
      const pdf = await cargarPdf();
      pdf.previsualizar(await pdf.pedidosParaImprimir(visiblesMarcados, papel));
    } catch (e) {
      toast.error('No se pudo armar la impresión: ' + (e as Error).message);
    } finally {
      setImprimiendo(false);
    }
  }

  /** Borra los marcados en una sola llamada, no uno por uno. */
  async function borrarMarcados() {
    const ids = visiblesMarcados.map((p) => p.id);
    if (!ids.length) return;

    const ok = await confirmar({
      titulo: `¿Eliminar ${ids.length} pedido(s)?`,
      mensaje: 'Se borran de la hoja de cálculo junto con todos sus artículos.',
      confirmar: `Eliminar ${ids.length}`,
      peligro: true,
    });
    if (!ok) return;

    try {
      await eliminarVarios.mutateAsync(ids);
      setMarcados(new Set());
      toast.ok(`${ids.length} pedido(s) eliminado(s).`);
    } catch (e) {
      toast.error('No se pudo eliminar: ' + (e as Error).message);
    }
  }

  async function borrar(p: Pedido) {
    const ok = await confirmar({
      titulo: `¿Eliminar el pedido No. ${p.numero}?`,
      mensaje: p.cliente?.razon_social
        ? `Se borra de la hoja de cálculo, con sus ${p.items.length} artículo(s). El pedido es de ${p.cliente.razon_social}.`
        : 'Se borra de la hoja de cálculo junto con sus artículos.',
      confirmar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await eliminar.mutateAsync(p.id);
      toast.ok('Pedido eliminado.');
    } catch (e) {
      toast.error('No se pudo eliminar: ' + (e as Error).message);
    }
  }

  if (isLoading) return <ListadoEsqueleto filas={4} />;

  return (
    <div className="tarjeta">
      <div className="barra-herramientas">
        <div className="tarjeta-titulo" style={{ marginBottom: 0 }}>
          Pedidos ({lista.length})
          {visiblesMarcados.length > 0 && (
            <span className="acciones-lote">
              <select
                value={papel}
                onChange={(e) => {
                  const p = e.target.value as Papel;
                  setPapel(p);
                  guardarPapel(p);
                }}
                aria-label="Papel de impresión"
                title="Papel de impresión"
              >
                <option value="media-carta">Media carta</option>
                <option value="carta-doble">Carta, 2 por hoja</option>
              </select>
              <button
                type="button"
                className="btn-icono"
                onClick={imprimirMarcados}
                disabled={imprimiendo}
              >
                <IconoImprimir />
                {imprimiendo ? 'Armando…' : `Imprimir ${visiblesMarcados.length}`}
              </button>
              <button
                type="button"
                className="btn-icono peligro"
                onClick={borrarMarcados}
                disabled={eliminarVarios.isPending}
              >
                <IconoBorrar />
                {eliminarVarios.isPending
                  ? 'Eliminando…'
                  : `Eliminar ${visiblesMarcados.length}`}
              </button>
            </span>
          )}
        </div>
        <div className="filtros">
          <input
            type="search"
            placeholder="Buscar por número o cliente…"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
          />
          <select value={linea} onChange={(e) => setLinea(e.target.value as FiltroLinea)}>
            <option value="todas">Las dos líneas</option>
            <option value="CONDIMAR">Condimar</option>
            <option value="NIDALCA">Nidalca</option>
          </select>
          <select value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)}>
            <option value="todos">Todos</option>
            <option value="borrador">Borradores</option>
            <option value="finalizado">Finalizados</option>
          </select>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="vacio">
          {pedidos.length === 0
            ? 'Todavía no hay pedidos. Cree el primero en «Nuevo pedido».'
            : 'Ningún pedido coincide con el filtro.'}
        </div>
      ) : (
        <div className="tabla-scroll">
          <table className="apilable">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    className="casilla"
                    checked={todosMarcados}
                    onChange={alternarTodos}
                    aria-label="Marcar todos"
                  />
                </th>
                <th style={{ width: 70 }}>No.</th>
                <th style={{ width: 90 }}>Línea</th>
                <th>Cliente</th>
                <th style={{ width: 110 }}>Fecha</th>
                <th style={{ width: 110 }}>Estado</th>
                <th style={{ width: 120 }}>Total</th>
                <th style={{ width: 300 }} />
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className={marcados.has(p.id) ? 'fila-marcada' : ''}>
                  <td data-etiqueta="Seleccionar">
                    <input
                      type="checkbox"
                      className="casilla"
                      checked={marcados.has(p.id)}
                      onChange={() => alternar(p.id)}
                      aria-label={`Marcar el pedido No. ${p.numero}`}
                    />
                  </td>
                  <td data-etiqueta="Número" className="num">
                    {p.numero}
                  </td>
                  <td data-etiqueta="Línea">
                    <span className={`pildora pildora-${p.linea.toLowerCase()}`}>
                      {p.linea === 'CONDIMAR' ? 'Condimar' : 'Nidalca'}
                    </span>
                  </td>
                  <td data-etiqueta="Cliente">{p.cliente?.razon_social ?? '—'}</td>
                  <td data-etiqueta="Fecha">{fmtDate(p.fecha)}</td>
                  <td data-etiqueta="Estado">
                    <span className={`pildora pildora-${p.estado}`}>{p.estado}</span>
                  </td>
                  <td data-etiqueta="Total" className="num item-subtotal">
                    {COP(p.totales?.total ?? 0)}
                  </td>
                  <td>
                    <div className="acciones-fila">
                      {/* Tambien los finalizados: se corrigen y se guardan de nuevo. */}
                      <button
                        type="button"
                        className="btn-icono"
                        onClick={() => editar(p)}
                        title={`Editar el pedido No. ${p.numero}`}
                      >
                        <IconoEditar />
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn-icono"
                        onClick={() => verPdf(p)}
                        title={`Ver el pedido No. ${p.numero}`}
                      >
                        <IconoOjo />
                        Ver
                      </button>
                      <button
                        type="button"
                        className="btn-icono"
                        onClick={() => descargarPdf(p)}
                        title={`Descargar el pedido No. ${p.numero} en PDF`}
                      >
                        <IconoPdf />
                        PDF
                      </button>
                      {compartible && (
                        <button
                          type="button"
                          className="btn-icono"
                          onClick={() => compartir(p)}
                          title={`Compartir el pedido No. ${p.numero}`}
                        >
                          <IconoCompartir />
                          Compartir
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-icono peligro"
                        onClick={() => borrar(p)}
                        title={`Eliminar el pedido No. ${p.numero}`}
                      >
                        <IconoBorrar />
                        Borrar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
