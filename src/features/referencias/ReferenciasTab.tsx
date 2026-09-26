import { useMemo } from 'react';
import { useCatalogos } from '../../api/queries';
import { ListadoEsqueleto } from '../../components/Esqueleto';
import { unidadesPorCaja } from '../../domain';
import type { Linea, Producto } from '../../domain/types';

/**
 * Referencias del Informe y que articulos alimenta cada una.
 *
 * Es de consulta, no de edicion. El mapeo se resolvio en la migracion con
 * reglas sobre el nombre y el empaque, y vive en la columna `referencia_id`
 * de la pestaña `productos`. Cambiarlo desde aqui, articulo por articulo,
 * invitaria a dejar el catalogo a medio migrar.
 *
 * Lo que si hace esta pantalla es mostrar el resultado, para poder revisarlo:
 * una referencia sin articulos o un articulo sin referencia son errores que
 * se ven de un golpe.
 */
export function ReferenciasTab({ linea }: { linea: Linea }) {
  const { data: catalogos, isLoading } = useCatalogos();

  const { filas, huerfanos } = useMemo(() => {
    const referencias = catalogos.referencias
      .filter((r) => r.linea === linea)
      .sort((a, b) => a.orden - b.orden);

    const productos = catalogos.productos[linea];

    const porReferencia = new Map<string, Producto[]>();
    const sinReferencia: Producto[] = [];

    for (const p of productos) {
      if (!p.referenciaId) {
        sinReferencia.push(p);
        continue;
      }
      const lista = porReferencia.get(p.referenciaId) ?? [];
      lista.push(p);
      porReferencia.set(p.referenciaId, lista);
    }

    return {
      filas: referencias.map((r) => ({ ...r, productos: porReferencia.get(r.id) ?? [] })),
      huerfanos: sinReferencia,
    };
  }, [catalogos, linea]);

  if (isLoading) return <ListadoEsqueleto filas={8} />;

  const sinArticulos = filas.filter((f) => f.productos.length === 0).length;

  return (
    <>
      {(huerfanos.length > 0 || sinArticulos > 0) && (
        <div className="aviso-offline">
          {huerfanos.length > 0 && (
            <div>
              <strong>{huerfanos.length} artículo(s) sin referencia.</strong> No suman a
              ninguna fila del Informe: {huerfanos.map((p) => p.producto).join(', ')}
            </div>
          )}
          {sinArticulos > 0 && (
            <div>
              {sinArticulos} referencia(s) sin artículos. Aparecen en el Informe siempre en
              cero.
            </div>
          )}
        </div>
      )}

      <div className="tarjeta">
        <div className="barra-herramientas">
          <div>
            <div className="tarjeta-titulo" style={{ marginBottom: 2 }}>
              Referencias — {linea === 'CONDIMAR' ? 'Condimar' : 'Nidalca'} ({filas.length})
            </div>
            <div className="item-categoria">
              {linea === 'CONDIMAR'
                ? 'Cada fila del Informe y los artículos cuyas cajas suma.'
                : 'En Nidalca la fila del Informe la determina la categoría del artículo.'}
            </div>
          </div>
        </div>

        <div className="tabla-scroll tabla-alta">
          <table className="apilable">
            <thead>
              <tr>
                <th style={{ width: 200 }}>Fila del Informe</th>
                <th style={{ width: 90 }}>Artículos</th>
                <th style={{ width: 100 }}>Por caja</th>
                <th>Qué incluye</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const embalajes = [
                  ...new Set(
                    f.productos.map((p) =>
                      p.linea === 'CONDIMAR' ? unidadesPorCaja(p.embalaje) : 1,
                    ),
                  ),
                ];

                return (
                  <tr key={f.id} className={f.productos.length === 0 ? 'fila-apagada' : ''}>
                    <td data-etiqueta="Fila del Informe">
                      <div className="item-nombre">{f.etiqueta}</div>
                      <div className="item-categoria">{f.id}</div>
                    </td>
                    <td data-etiqueta="Artículos" className="num">
                      {f.productos.length}
                    </td>
                    <td data-etiqueta="Unidades por caja" className="num">
                      {embalajes.length ? embalajes.join(' / ') : '—'}
                    </td>
                    <td data-etiqueta="Qué incluye" className="lista-articulos">
                      {f.productos.length === 0 ? (
                        <span className="apagado">Ningún artículo</span>
                      ) : (
                        f.productos.map((p) => p.producto).join(' · ')
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="nota" style={{ marginBottom: 0 }}>
          Para cambiar a qué fila suma un artículo, se edita su columna{' '}
          <code>referencia_id</code> en la pestaña <code>productos</code> de la hoja, y
          luego se recarga desde Configuración.
        </p>
      </div>
    </>
  );
}
