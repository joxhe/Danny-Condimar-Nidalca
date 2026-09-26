import { useMemo, useState } from 'react';
import { useCatalogos } from '../../api/queries';
import { ListadoEsqueleto } from '../../components/Esqueleto';
import { COP, unidadesPorCaja } from '../../domain';
import type { Linea, Producto } from '../../domain/types';

/**
 * Consulta de precios.
 *
 * Es de solo lectura a proposito: los precios los fija la empresa, no el
 * vendedor. Para corregir uno se edita la hoja y se recarga.
 */
export function CatalogoTab({ linea }: { linea: Linea }) {
  const { data: catalogos, isLoading } = useCatalogos();
  const [consulta, setConsulta] = useState('');
  const [categoria, setCategoria] = useState('todas');

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
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <FilaProducto key={p.id} producto={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilaProducto({ producto: p }: { producto: Producto }) {
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
    </tr>
  );
}
