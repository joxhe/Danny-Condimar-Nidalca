import { useMemo, useState } from 'react';
import { useCatalogos, useGuardarPedido, useSiguienteNumero } from '../../api/queries';
import { Buscador } from '../../components/Buscador';
import { CampoNumero } from '../../components/CampoNumero';
import { IconoMas } from '../../components/Iconos';
import { PedidoEsqueleto } from '../../components/Esqueleto';
import {
  COP,
  calcularLinea,
  computeTotales,
  fechaEsPasada,
  todayISO,
  unidadesACajas,
} from '../../domain';
import type { Cliente, ItemPedido, Producto } from '../../domain/types';
import { confirmar } from '../../store/dialogo';
import { usePedidoBorrador } from '../../store/pedidoBorrador';
import { toast } from '../../store/toast';

/**
 * El motor de PDF pesa mas de un megabyte y solo hace falta cuando se emite un
 * documento. Cargarlo aparte baja el arranque de 1,6 MB a unos 250 KB, que en
 * ruta con señal mala es la diferencia entre abrir la app y quedarse mirando.
 */
const cargarPdf = () => import('../../pdf/generar');

const BUSCADOR_ARTICULO = 'buscador-articulo';

/**
 * Atajo para seguir agregando sin volver a subir.
 *
 * Con quince renglones cargados, el buscador queda fuera de pantalla y hay que
 * recorrer toda la lista para llegar. Este boton lleva el foco alla y deja el
 * campo listo para escribir, sin duplicar el buscador ni su estado.
 */
function AgregarOtro() {
  return (
    <button
      type="button"
      className="btn-agregar-otro"
      onClick={() => {
        const campo = document.getElementById(BUSCADOR_ARTICULO);
        campo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        campo?.focus({ preventScroll: true });
      }}
    >
      <IconoMas />
      Agregar otro artículo
    </button>
  );
}

export function PedidoTab() {
  const { data: catalogos, isLoading, offline } = useCatalogos();
  const guardar = useGuardarPedido();
  const pedirNumero = useSiguienteNumero();
  const [generando, setGenerando] = useState(false);

  const b = usePedidoBorrador();
  const totales = useMemo(() => computeTotales(b.items), [b.items]);

  const clientes = catalogos.clientes[b.linea];
  const productos = catalogos.productos[b.linea];

  async function asegurarNumero(): Promise<string | number> {
    if (b.numero) return b.numero;
    const r = await pedirNumero.mutateAsync(b.linea);
    b.setNumero(r.numero);
    return r.numero;
  }

  function validar(): boolean {
    if (!b.cliente) {
      toast.error('Seleccione un cliente antes de continuar.');
      return false;
    }
    if (b.items.length === 0) {
      toast.error('Agregue al menos un artículo.');
      return false;
    }
    // El `min` del campo guia, pero no impide escribir la fecha a mano.
    if (fechaEsPasada(b.fecha)) {
      toast.error('La fecha del pedido no puede ser anterior a hoy.');
      return false;
    }
    return true;
  }

  async function guardarBorrador() {
    if (!validar()) return;
    try {
      const numero = await asegurarNumero();
      const pedido = b.construir('borrador', numero);
      await guardar.mutateAsync(pedido);
      toast.ok(`Pedido No. ${numero} guardado como borrador.`);
    } catch (e) {
      toast.error('No se pudo guardar: ' + (e as Error).message);
    }
  }

  async function finalizar() {
    if (!validar()) return;
    setGenerando(true);
    try {
      const numero = await asegurarNumero();
      const pedido = b.construir('finalizado', numero);
      await guardar.mutateAsync(pedido);

      const pdf = await cargarPdf();
      const blob = await pdf.pedidoABlob(pedido);
      const modo = await pdf.entregar(blob, pdf.nombrePedido(pedido));

      toast.ok(
        modo === 'compartido'
          ? `Pedido No. ${numero} finalizado y compartido.`
          : `Pedido No. ${numero} finalizado. PDF descargado.`,
      );
      b.limpiar();
    } catch (e) {
      toast.error('No se pudo finalizar: ' + (e as Error).message);
    } finally {
      setGenerando(false);
    }
  }

  async function vistaPrevia() {
    if (!validar()) return;
    setGenerando(true);
    try {
      const pdf = await cargarPdf();
      pdf.previsualizar(await pdf.pedidoABlob(b.construir('borrador', b.numero ?? 'S/N')));
    } catch (e) {
      toast.error('No se pudo generar el PDF: ' + (e as Error).message);
    } finally {
      setGenerando(false);
    }
  }

  async function descartar() {
    if (!b.tieneContenido()) return;
    const seguir = await confirmar({
      titulo: '¿Descartar el pedido?',
      mensaje: 'Se pierden el cliente y los artículos cargados.',
      confirmar: 'Descartar',
      peligro: true,
    });
    if (!seguir) return;
    b.limpiar();
    toast.ok('Pedido descartado.');
  }

  if (isLoading) return <PedidoEsqueleto />;

  const ocupado = generando || guardar.isPending || pedirNumero.isPending;

  return (
    <>
      {offline && (
        <div className="aviso-offline">
          Sin conexión. Se están mostrando los datos guardados en este dispositivo.
        </div>
      )}

      <div className="tarjeta">
        <div className="pedido-cabecera">
          <div className="tarjeta-titulo" style={{ marginBottom: 0 }}>
            {b.numero ? `Pedido No. ${b.numero}` : 'Pedido nuevo'}
          </div>
          <div className="pedido-fecha">
            <label htmlFor="fecha">Fecha</label>
            <input
              id="fecha"
              type="date"
              value={b.fecha}
              min={todayISO()}
              onChange={(e) => b.setFecha(e.target.value)}
            />
          </div>
        </div>

        <label htmlFor="cliente">Cliente</label>
        <Buscador<Cliente>
          placeholder={`Buscar entre ${clientes.length} clientes por nombre, NIT o ciudad…`}
          items={clientes}
          valor={b.cliente}
          etiqueta={(c) => c.razon_social}
          detalle={(c) => `NIT ${c.nit}${c.dv ? '-' + c.dv : ''} · ${c.ciudad}`}
          onElegir={b.setCliente}
        />

        {b.cliente && <FichaCliente cliente={b.cliente} />}
      </div>

      <div className="tarjeta">
        <label htmlFor="articulo">Agregar artículo</label>
        <Buscador<Producto>
          inputId={BUSCADOR_ARTICULO}
          placeholder={`Buscar entre ${productos.length} artículos…`}
          items={productos}
          limpiarAlElegir
          etiqueta={(p) => p.producto}
          detalle={(p) => `${p.categoria} · ${COP(p.precio)}`}
          onElegir={(p) => {
            b.agregarProducto(p);
            toast.ok(`${p.producto} agregado.`);
          }}
        />

        <TablaItems />
        <AgregarOtro />
      </div>

      <div className="tarjeta">
        <label htmlFor="obs">Observaciones generales</label>
        <textarea
          id="obs"
          rows={2}
          placeholder="Opcional"
          value={b.obsGenerales}
          onChange={(e) => b.setObsGenerales(e.target.value)}
        />
      </div>

      <div className="tarjeta tarjeta-totales">
        <BloqueTotales totales={totales} />
      </div>

      <div className="acciones">
        <button type="button" className="btn-fantasma" onClick={descartar}>
          Descartar
        </button>
        <button
          type="button"
          className="btn-secundario"
          disabled={ocupado}
          onClick={vistaPrevia}
        >
          Vista previa
        </button>
        <button
          type="button"
          className="btn-secundario"
          disabled={ocupado}
          onClick={guardarBorrador}
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar borrador'}
        </button>
        <button type="button" className="btn-primario" disabled={ocupado} onClick={finalizar}>
          {generando ? 'Generando PDF…' : 'Finalizar y enviar'}
        </button>
      </div>
    </>
  );
}

function FichaCliente({ cliente }: { cliente: Cliente }) {
  return (
    <div className="ficha-cliente">
      <span>{cliente.direccion}</span>
      <span>·</span>
      <span>{cliente.ciudad}</span>
      <span>·</span>
      <span>Tel {cliente.telefono || '—'}</span>
      <span>·</span>
      <span>Plazo {cliente.plazo_credito} días</span>
      {!cliente.compro && <span className="pildora pildora-aviso">No compró este año</span>}
    </div>
  );
}

/**
 * Tabla de renglones.
 *
 * Muestra las cajas junto a las unidades porque es la magnitud del Informe:
 * el vendedor ve al capturar si completó caja o le faltan unidades, en vez de
 * enterarse el sábado cuando arma el corte.
 */
function TablaItems() {
  const items = usePedidoBorrador((s) => s.items);
  const actualizar = usePedidoBorrador((s) => s.actualizarItem);
  const quitar = usePedidoBorrador((s) => s.quitarItem);

  if (items.length === 0) {
    return <div className="vacio">Todavía no hay artículos agregados.</div>;
  }

  return (
    <div className="tabla-scroll">
      <table className="apilable">
        <thead>
          <tr>
            <th>Artículo</th>
            <th style={{ width: 90 }}>Cant.</th>
            <th style={{ width: 90 }}>Cajas</th>
            <th style={{ width: 100 }}>Precio</th>
            <th style={{ width: 80 }}>Desc. %</th>
            <th>Observación</th>
            <th style={{ width: 110 }}>Subtotal</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <FilaItem
              key={it.lineId}
              item={it}
              onCambiar={(patch) => actualizar(it.lineId, patch)}
              onQuitar={() => quitar(it.lineId)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilaItem({
  item,
  onCambiar,
  onQuitar,
}: {
  item: ItemPedido;
  onCambiar: (patch: Partial<ItemPedido>) => void;
  onQuitar: () => void;
}) {
  const l = calcularLinea(item);
  const embalaje = item.linea === 'CONDIMAR' ? item.embalaje : 1;
  const cajas = unidadesACajas(Number(item.cantidad) || 0, embalaje);

  return (
    <tr>
      <td data-etiqueta="Artículo">
        <div className="item-nombre">{item.producto}</div>
        <div className="item-categoria">{item.categoria}</div>
      </td>

      <td data-etiqueta="Cantidad">
        <CampoNumero
          valor={item.cantidad}
          min={0}
          etiqueta={`Cantidad de ${item.producto}`}
          onCambiar={(cantidad) => onCambiar({ cantidad })}
        />
      </td>

      <td data-etiqueta="Cajas">
        <CeldaCajas cajas={cajas.cajas} pendientes={cajas.unidadesPendientes} />
      </td>

      <td data-etiqueta="Precio" className="num">
        {COP(item.precio)}
      </td>

      <td data-etiqueta="Descuento %">
        <CampoNumero
          valor={item.descuentoPct}
          min={0}
          max={100}
          etiqueta={`Descuento de ${item.producto}`}
          onCambiar={(descuentoPct) => onCambiar({ descuentoPct })}
        />
      </td>

      <td data-etiqueta="Observación">
        <input
          type="text"
          placeholder="Opcional"
          value={item.observaciones}
          onChange={(e) => onCambiar({ observaciones: e.target.value })}
        />
      </td>

      <td data-etiqueta="Subtotal" className="num item-subtotal">
        {COP(l.bruto - l.descuento)}
      </td>

      <td>
        <button type="button" className="btn-peligro" onClick={onQuitar} title="Quitar">
          ✕
        </button>
      </td>
    </tr>
  );
}

/** Cajas completas y, si sobran unidades, cuantas faltan para la siguiente. */
function CeldaCajas({ cajas, pendientes }: { cajas: number; pendientes: number }) {
  return (
    <div className="celda-cajas">
      <span className="num">{cajas}</span>
      {pendientes > 0 && (
        <span className="cajas-pendientes" title="Unidades que no completan caja">
          +{pendientes} u.
        </span>
      )}
    </div>
  );
}

function BloqueTotales({ totales }: { totales: ReturnType<typeof computeTotales> }) {
  return (
    <div className="totales">
      <Renglon etiqueta="Valor antes de descuento" valor={COP(totales.bruto)} />
      <Renglon etiqueta="Valor del descuento" valor={'-' + COP(totales.descuento)} />
      <div className="total-subtotal">
        <span>SUBTOTAL</span>
        <span className="num">{COP(totales.subtotal)}</span>
      </div>
      <Renglon etiqueta="Valor del impuesto (IVA)" valor={COP(totales.iva)} />
      <Renglon etiqueta="Valor del ICUI" valor={COP(totales.icui)} />
      <div className="total-final">
        <span>TOTAL A CANCELAR</span>
        <span className="num">{COP(totales.total)}</span>
      </div>
    </div>
  );
}

function Renglon({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="total-renglon">
      <span>{etiqueta}</span>
      <span className="num">{valor}</span>
    </div>
  );
}
