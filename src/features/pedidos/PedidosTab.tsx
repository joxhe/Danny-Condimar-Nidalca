import { useMemo, useState } from 'react';
import { useEliminarPedido, useEliminarPedidos, usePedidos } from '../../api/queries';
import { ListadoEsqueleto } from '../../components/Esqueleto';
import { IconoBorrar, IconoEditar, IconoOjo, IconoPdf } from '../../components/Iconos';
import { COP, fmtDate } from '../../domain';
import type { EstadoPedido, Linea, Pedido } from '../../domain/types';
import { confirmar } from '../../store/dialogo';
import { usePedidoBorrador } from '../../store/pedidoBorrador';
import { toast } from '../../store/toast';

const cargarPdf = () => import('../../pdf/generar');

type FiltroEstado = EstadoPedido | 'todos';
type FiltroLinea = Linea | 'todas';

export function PedidosTab({ onEditar }: { onEditar: () => void }) {
  const { data: pedidos = [], isLoading } = usePedidos();
  const eliminar = useEliminarPedido();
  const eliminarVarios = useEliminarPedidos();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const cargarDesde = usePedidoBorrador((s) => s.cargarDesde);
  const tieneContenido = usePedidoBorrador((s) => s.tieneContenido);

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

  async function reimprimir(p: Pedido) {
    try {
      const pdf = await cargarPdf();
      const blob = await pdf.pedidoABlob(p);
      await pdf.entregar(blob, pdf.nombrePedido(p));
    } catch (e) {
      toast.error('No se pudo generar el PDF: ' + (e as Error).message);
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
            <button
              type="button"
              className="btn-icono peligro"
              style={{ marginLeft: 'var(--e3)' }}
              onClick={borrarMarcados}
              disabled={eliminarVarios.isPending}
            >
              <IconoBorrar />
              {eliminarVarios.isPending
                ? 'Eliminando…'
                : `Eliminar ${visiblesMarcados.length}`}
            </button>
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
                <th style={{ width: 280 }} />
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
                      {p.estado === 'borrador' && (
                        <button
                          type="button"
                          className="btn-icono"
                          onClick={() => editar(p)}
                          title="Editar este borrador"
                        >
                          <IconoEditar />
                          Editar
                        </button>
                      )}
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
                        onClick={() => reimprimir(p)}
                        title={`Descargar o compartir el pedido No. ${p.numero}`}
                      >
                        <IconoPdf />
                        PDF
                      </button>
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
