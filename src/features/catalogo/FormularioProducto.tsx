import { CampoNumero } from '../../components/CampoNumero';
import { COP } from '../../domain';
import type { Producto, ProductoCondimar, Referencia } from '../../domain/types';

interface Props {
  producto: Producto;
  /** Precio que tenía al abrir el formulario, para poder comparar. */
  precioOriginal: number;
  referencias: Referencia[];
  onCambiar: (p: Producto) => void;
  onGuardar: () => void;
  onCancelar: () => void;
  guardando: boolean;
}

/**
 * Edición de un artículo del catálogo.
 *
 * Cambiar el precio aquí NO altera ningún pedido ya emitido: cada renglón
 * guarda su propio precio al momento de guardarse, y el documento entregado
 * no puede cambiar despues. Solo los pedidos nuevos toman el precio nuevo.
 */
export function FormularioProducto({
  producto,
  precioOriginal,
  referencias,
  onCambiar,
  onGuardar,
  onCancelar,
  guardando,
}: Props) {
  const set = <K extends keyof Producto>(campo: K, valor: Producto[K]) =>
    onCambiar({ ...producto, [campo]: valor } as Producto);

  const cambioPrecio = producto.precio !== precioOriginal;
  const diferencia = producto.precio - precioOriginal;
  const pct = precioOriginal > 0 ? (diferencia / precioOriginal) * 100 : 0;

  return (
    <div className="tarjeta tarjeta-formulario">
      <div className="tarjeta-titulo">
        Editar artículo
        <span className="item-categoria"> · {producto.id}</span>
      </div>

      <div className="rejilla-formulario">
        <div className="campo-ancho">
          <label htmlFor="nombre">Nombre del artículo</label>
          <input
            id="nombre"
            value={producto.producto}
            onChange={(e) => set('producto', e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="categoria">Categoría</label>
          <input
            id="categoria"
            value={producto.categoria}
            onChange={(e) => set('categoria', e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="precio">Precio</label>
          <CampoNumero
            valor={producto.precio}
            min={0}
            etiqueta="Precio del artículo"
            onCambiar={(n) => set('precio', n)}
          />
        </div>

        <div>
          <label htmlFor="iva">IVA %</label>
          <CampoNumero
            valor={producto.iva}
            min={0}
            max={100}
            etiqueta="Porcentaje de IVA"
            onCambiar={(n) => set('iva', n)}
          />
        </div>

        {producto.linea === 'CONDIMAR' && (
          <CamposCondimar producto={producto} onCambiar={onCambiar} />
        )}

        <div>
          <label htmlFor="referencia">Fila del Informe</label>
          <select
            id="referencia"
            value={producto.referenciaId}
            onChange={(e) => set('referenciaId', e.target.value)}
          >
            <option value="">Sin referencia</option>
            {referencias.map((r) => (
              <option key={r.id} value={r.id}>
                {r.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      {cambioPrecio && (
        <div className="aviso-precio">
          <div>
            <strong>
              {COP(precioOriginal)} → {COP(producto.precio)}
            </strong>{' '}
            <span className={diferencia > 0 ? 'negativo' : 'positivo'}>
              ({diferencia > 0 ? '+' : ''}
              {pct.toFixed(1)}%)
            </span>
          </div>
          <div className="ayuda" style={{ marginTop: 4 }}>
            Los pedidos ya emitidos conservan el precio con que salieron. El nuevo rige
            desde el próximo pedido.
          </div>
        </div>
      )}

      <div className="acciones">
        <button type="button" className="btn-fantasma" onClick={onCancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn-primario"
          onClick={onGuardar}
          disabled={guardando || !producto.producto.trim()}
        >
          {guardando ? 'Guardando…' : 'Guardar artículo'}
        </button>
      </div>
    </div>
  );
}

/**
 * ICUI y embalaje solo existen en Condimar.
 *
 * Van en su propio componente para que el tipo sea exacto: escritos junto al
 * resto, el compilador solo ve los campos comunes a las dos lineas.
 */
function CamposCondimar({
  producto,
  onCambiar,
}: {
  producto: ProductoCondimar;
  onCambiar: (p: Producto) => void;
}) {
  return (
    <>
      <div>
        <label htmlFor="icui">ICUI %</label>
        <CampoNumero
          valor={producto.icui}
          min={0}
          max={100}
          etiqueta="Porcentaje de ICUI"
          onCambiar={(icui) => onCambiar({ ...producto, icui })}
        />
      </div>

      <div>
        <label htmlFor="embalaje">Unidades por caja</label>
        <input
          id="embalaje"
          value={String(producto.embalaje)}
          onChange={(e) => onCambiar({ ...producto, embalaje: e.target.value })}
        />
        <p className="ayuda">Un número, o «KILO» si se vende al peso.</p>
      </div>
    </>
  );
}
