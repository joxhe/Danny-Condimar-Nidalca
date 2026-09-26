import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clearApiUrl, getApiUrl, setApiUrl } from '../../api/client';
import { keys, useCatalogos } from '../../api/queries';
import { confirmar } from '../../store/dialogo';
import { toast } from '../../store/toast';

export function ConfigTab() {
  const qc = useQueryClient();
  const { data: catalogos, offline, refetch } = useCatalogos();
  const [url, setUrl] = useState(getApiUrl());
  const [probando, setProbando] = useState(false);

  const deEntorno = import.meta.env.VITE_API_URL ?? '';
  const personalizada = url !== deEntorno;

  async function probar() {
    setProbando(true);
    try {
      const base = url.trim();
      const res = await fetch(base + (base.includes('?') ? '&' : '?') + 'accion=ping');
      const datos = await res.json();
      if (datos.error) throw new Error(datos.error);
      toast.ok(`Conectado a «${datos.hoja}».`);
    } catch (e) {
      toast.error('No responde: ' + (e as Error).message);
    } finally {
      setProbando(false);
    }
  }

  function guardar() {
    setApiUrl(url);
    qc.invalidateQueries();
    toast.ok('URL guardada. Recargando datos…');
  }

  function restaurar() {
    clearApiUrl();
    setUrl(deEntorno);
    qc.invalidateQueries();
    toast.ok('Restaurada la URL de fábrica.');
  }

  async function recargar() {
    await refetch();
    toast.ok('Datos actualizados desde la hoja.');
  }

  const totales = {
    productos:
      catalogos.productos.CONDIMAR.length + catalogos.productos.NIDALCA.length,
    clientes: catalogos.clientes.CONDIMAR.length + catalogos.clientes.NIDALCA.length,
  };

  return (
    <>
      <div className="tarjeta">
        <div className="tarjeta-titulo">Estado de la conexión</div>

        <div className="estado-conexion">
          <span className={`punto ${offline ? 'punto-error' : 'punto-ok'}`} />
          <span>
            {offline
              ? 'Sin conexión — trabajando con datos de este dispositivo'
              : 'Conectado a la hoja de cálculo'}
          </span>
        </div>

        <div className="rejilla-estadisticas">
          <Estadistica etiqueta="Artículos" valor={totales.productos} />
          <Estadistica etiqueta="Clientes" valor={totales.clientes} />
          <Estadistica
            etiqueta="Condimar"
            valor={`${catalogos.productos.CONDIMAR.length} art · ${catalogos.clientes.CONDIMAR.length} cli`}
          />
          <Estadistica
            etiqueta="Nidalca"
            valor={`${catalogos.productos.NIDALCA.length} art · ${catalogos.clientes.NIDALCA.length} cli`}
          />
        </div>

        <div className="acciones" style={{ marginTop: 'var(--e3)' }}>
          <button type="button" className="btn-secundario" onClick={recargar}>
            Recargar desde la hoja
          </button>
        </div>
      </div>

      <div className="tarjeta">
        <div className="tarjeta-titulo">Conexión con Google Sheets</div>

        <label htmlFor="url">URL de la aplicación web de Apps Script</label>
        <input
          id="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/XXXX/exec"
          spellCheck={false}
        />

        <p className="nota">
          {personalizada ? (
            <>
              Está usando una URL propia de este dispositivo, distinta a la del despliegue.
            </>
          ) : (
            <>
              Se está usando la URL configurada en el despliegue. Solo hace falta cambiarla
              aquí si quiere apuntar a otra hoja desde este dispositivo.
            </>
          )}
        </p>

        <div className="acciones">
          {personalizada && (
            <button type="button" className="btn-fantasma" onClick={restaurar}>
              Volver a la de fábrica
            </button>
          )}
          <button
            type="button"
            className="btn-secundario"
            onClick={probar}
            disabled={probando || !url.trim()}
          >
            {probando ? 'Probando…' : 'Probar conexión'}
          </button>
          <button
            type="button"
            className="btn-primario"
            onClick={guardar}
            disabled={!url.trim()}
          >
            Guardar y recargar
          </button>
        </div>
      </div>

      <div className="tarjeta">
        <div className="tarjeta-titulo">Datos guardados en este dispositivo</div>
        <p className="nota">
          El catálogo y los pedidos se guardan en el navegador para que la app funcione sin
          señal. Si algo se ve desactualizado y recargar no alcanza, vaciar esta copia
          obliga a bajar todo de nuevo.
        </p>
        <div className="acciones">
          <button
            type="button"
            className="btn-fantasma"
            onClick={async () => {
              const ok = await confirmar({
                titulo: 'Vaciar la copia local',
                mensaje:
                  'Se borra lo guardado en este dispositivo y se vuelve a bajar todo de la hoja. Necesita conexión.',
                confirmar: 'Vaciar',
              });
              if (!ok) return;
              await qc.resetQueries({ queryKey: keys.catalogos });
              await qc.resetQueries({ queryKey: keys.pedidos });
              indexedDB.deleteDatabase('pedidos-condimar');
              toast.ok('Copia local vaciada. Recargue la página.');
            }}
          >
            Vaciar copia local
          </button>
        </div>
      </div>
    </>
  );
}

function Estadistica({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <div className="estadistica">
      <div className="estadistica-valor num">{valor}</div>
      <div className="estadistica-etiqueta">{etiqueta}</div>
    </div>
  );
}
