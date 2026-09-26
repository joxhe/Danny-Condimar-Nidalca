/**
 * Esqueletos de carga.
 *
 * El catalogo son 92 KB que tardan un momento en llegar. Un bloque gris con la
 * forma de lo que viene se lee como "ya casi", mientras que un "Cargando…" en
 * el medio de la nada se lee como "se colgó".
 *
 * Todos llevan aria-hidden: para un lector de pantalla no son contenido. El
 * anuncio de que algo esta cargando lo hace el contenedor con aria-busy.
 */

export function Linea({ ancho = '100%', alto = 14 }: { ancho?: string; alto?: number }) {
  return <span className="esqueleto" style={{ width: ancho, height: alto }} aria-hidden />;
}

/** Bloque de campo: etiqueta corta arriba, control debajo. */
export function CampoEsqueleto() {
  return (
    <div className="esqueleto-campo" aria-hidden>
      <Linea ancho="90px" alto={11} />
      <Linea alto={40} />
    </div>
  );
}

export function TarjetaEsqueleto({ campos = 2 }: { campos?: number }) {
  return (
    <div className="tarjeta" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: campos }, (_, i) => (
        <CampoEsqueleto key={i} />
      ))}
    </div>
  );
}

/**
 * Tabla fantasma.
 *
 * Los anchos de las celdas se alternan con un patron fijo, no al azar: si
 * cambiaran en cada render el bloque titilaria en cada actualizacion.
 */
const ANCHOS = ['70%', '45%', '85%', '55%', '75%', '40%', '65%', '50%'];

export function TablaEsqueleto({ filas = 5, columnas = 4 }: { filas?: number; columnas?: number }) {
  return (
    <div className="esqueleto-tabla" aria-busy="true" aria-label="Cargando datos">
      {Array.from({ length: filas }, (_, f) => (
        <div className="esqueleto-fila" key={f}>
          {Array.from({ length: columnas }, (_, c) => (
            <Linea key={c} ancho={ANCHOS[(f * columnas + c) % ANCHOS.length]} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** La pantalla de pedido entera: cliente, articulos y totales. */
export function PedidoEsqueleto() {
  return (
    <>
      <TarjetaEsqueleto campos={2} />
      <div className="tarjeta" aria-busy="true" aria-label="Cargando catálogo">
        <CampoEsqueleto />
        <TablaEsqueleto filas={3} columnas={5} />
      </div>
      <div className="tarjeta tarjeta-totales" aria-hidden>
        <div className="totales">
          <Linea alto={16} />
          <Linea alto={16} />
          <Linea alto={22} />
        </div>
      </div>
    </>
  );
}

/** Listado con su barra de herramientas. */
export function ListadoEsqueleto({ filas = 6 }: { filas?: number }) {
  return (
    <div className="tarjeta" aria-busy="true" aria-label="Cargando">
      <div className="barra-herramientas">
        <Linea ancho="180px" alto={18} />
        <Linea ancho="240px" alto={38} />
      </div>
      <TablaEsqueleto filas={filas} columnas={5} />
    </div>
  );
}
