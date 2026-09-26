import { useMemo, useState } from 'react';
import { useCatalogos, useGuardarProductos } from '../../api/queries';
import { ListadoEsqueleto } from '../../components/Esqueleto';
import { IconoEditar } from '../../components/Iconos';
import { COP, unidadesPorCaja } from '../../domain';
import type { Linea, Producto } from '../../domain/types';
import { toast } from '../../store/toast';
import { FormularioProducto } from './FormularioProducto';

/**
 * Catalogo y edicion de articulos.
 *
 * Cambiar un precio aqui solo rige para los pedidos que se emitan despues:
 * cada renglon guarda su propio precio al guardarse el pedido, y un documento
 * ya entregado no puede cambiar de importe.
 */
export function CatalogoTab({ linea }: { linea: Linea }) {
  const { data: catalogos, isLoading } = useCatalogos();
  const guardar = useGuardarProductos();
  const [consulta, setConsulta] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [editando, setEditando] = useState<Producto | null>(null);
  const [precioOriginal, setPrecioOriginal] = useState(0);

  const referencias = useMemo(
    () => catalogos.referencias.filter((r) => r.linea === linea),
    [catalogos.referencias, linea],
  );

  function abrir(p: Producto) {
    setEditando({ ...p });
    setPrecioOriginal(p.precio);
  }

  async function guardarProducto() {
    if (!editando) return;
    try {
      await guardar.mutateAsync({ linea, datos: [editando] });
      setEditando(null);
      toast.ok(`${editando.producto} actualizado.`);
    } catch (e) {
      toast.error('No se pudo guardar: ' + (e as Error).message);
    }
  }

  const productos = catalogos.productos[linea];

  const categorias = useMemo(
    () => [...new Set(productos.map((p) => p.categoria))].sort(),
    [productos],
  );

  const lista = useMemo(() => {
    const palabras = consulta.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return productos
      .filter((p) => categoria === 'todas' || p.categoria === categoria)
      .filter((p) => {
        if (!palabras.length) return true;
        const texto = `${p.producto} ${p.categoria}`.toLowerCase();
        return palabras.every((w) => texto.includes(w));
      });
  }, [productos, consulta, categoria]);

  if (isLoading) return <ListadoEsqueleto filas={8} />;

  const esCondimar = linea === 'CONDIMAR';

  return (
    <>
      {editando && (
        <FormularioProducto
          producto={editando}
          precioOriginal={precioOriginal}
          referencias={referencias}
          onCambiar={setEditando}
          onGuardar={guardarProducto}
          onCancelar={() => setEditando(null)}
          guardando={guardar.isPending}
        />
      )}

      <div className="tarjeta">
      <div className="barra-herramientas">
        <div className="tarjeta-titulo" style={{ marginBottom: 0 }}>
          Catálogo — {esCondimar ? 'Condimar' : 'Nidalca'} ({lista.length} de{' '}
          {productos.length})
        </div>
        <div className="filtros">
          <input
            type="search"
            placeholder="Buscar artículo…"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
          />
          {categorias.length > 1 && (
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="todas">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="vacio">Ningún artículo coincide con la búsqueda.</div>
      ) : (
        <div className="tabla-scroll tabla-alta">
          <table className="apilable">
            <thead>
              <tr>
                <th>Artículo</th>
                {!esCondimar && <th style={{ width: 170 }}>Categoría</th>}
                <th style={{ width: 110 }}>Precio</th>
                <th style={{ width: 70 }}>IVA</th>
                {esCondimar && <th style={{ width: 70 }}>ICUI</th>}
                {esCondimar && <th style={{ width: 90 }}>Por caja</th>}
                <th style={{ width: 140 }}>Referencia</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <FilaProducto key={p.id} producto={p} onEditar={() => abrir(p)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </>
  );
}

function FilaProducto({
  producto: p,
  onEditar,
}: {
  producto: Producto;
  onEditar: () => void;
}) {
  const esCondimar = p.linea === 'CONDIMAR';

  return (
    <tr>
      <td data-etiqueta="Artículo">
        <div className="item-nombre">{p.producto}</div>
        <div className="item-categoria">{p.id}</div>
      </td>

      {!esCondimar && <td data-etiqueta="Categoría">{p.categoria}</td>}

      <td data-etiqueta="Precio" className="num item-subtotal">
        {COP(p.precio)}
      </td>

      <td data-etiqueta="IVA" className="num">
        {p.iva}%
      </td>

      {esCondimar && (
        <td data-etiqueta="ICUI" className="num">
          {p.icui}%
        </td>
      )}

      {esCondimar && (
        <td data-etiqueta="Unidades por caja" className="num">
          {/* El embalaje puede decir "KILO": ahi la unidad de venta ya es la del informe. */}
          {typeof p.embalaje === 'number' ? p.embalaje : unidadesPorCaja(p.embalaje)}
        </td>
      )}

      <td data-etiqueta="Referencia">
        <span className="pildora pildora-referencia">{p.referenciaId || '—'}</span>
      </td>

      <td>
        <button
          type="button"
          className="btn-icono"
          onClick={onEditar}
          title={`Editar ${p.producto}`}
        >
          <IconoEditar />
          Editar
        </button>
      </td>
    </tr>
  );
}
