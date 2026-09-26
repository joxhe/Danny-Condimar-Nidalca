import { useMemo, useState } from 'react';
import { useCatalogos, useGuardarPresupuestos, usePlaneacion } from '../../api/queries';
import { CampoNumero } from '../../components/CampoNumero';
import { ListadoEsqueleto } from '../../components/Esqueleto';
import { COP } from '../../domain';
import type { Linea, Presupuesto } from '../../domain/types';
import { toast } from '../../store/toast';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * Metas del mes.
 *
 * Son el punto de comparacion de todo el Informe: sin ellas el tablero dice
 * cuanto se vendio, pero no si alcanza. Se editan aqui para no tener que
 * abrir la hoja de calculo.
 */
export function PresupuestosTab({ linea }: { linea: Linea }) {
  const { data: catalogos, isLoading: cargandoCat } = useCatalogos();
  const { data: planeacion, isLoading: cargandoPlan } = usePlaneacion();
  const guardar = useGuardarPresupuestos();

  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [borrador, setBorrador] = useState<Map<string, number> | null>(null);

  const referencias = useMemo(
    () => catalogos.referencias.filter((r) => r.linea === linea).sort((a, b) => a.orden - b.orden),
    [catalogos.referencias, linea],
  );

  /** Lo guardado en la hoja para este mes, indexado por referencia. */
  const guardados = useMemo(() => {
    const m = new Map<string, Presupuesto>();
    for (const p of planeacion?.presupuestos ?? []) {
      if (p.linea === linea && p.anio === anio && p.mes === mes) m.set(p.referenciaId, p);
    }
    return m;
  }, [planeacion, linea, anio, mes]);

  const metaDe = (id: string) =>
    borrador?.get(id) ??
    (id === 'TOTAL' ? guardados.get(id)?.metaPesos : guardados.get(id)?.metaCajas) ??
    0;

  function cambiar(id: string, valor: number) {
    setBorrador((prev) => new Map(prev ?? []).set(id, valor));
  }

  const hayCambios = borrador !== null && borrador.size > 0;

  async function guardarTodo() {
    // Se manda el mes completo, no solo lo tocado: el script reemplaza la
    // pestaña entera y una carga parcial borraria el resto.
    const otrosMeses = (planeacion?.presupuestos ?? []).filter(
      (p) => !(p.linea === linea && p.anio === anio && p.mes === mes),
    );

    const deEsteMes: Presupuesto[] = [...referencias.map((r) => r.id), 'TOTAL'].map((id) => ({
      linea,
      referenciaId: id,
      anio,
      mes,
      metaCajas: id === 'TOTAL' ? 0 : metaDe(id),
      metaPesos: id === 'TOTAL' ? metaDe(id) : 0,
    }));

    try {
      await guardar.mutateAsync([...otrosMeses, ...deEsteMes]);
      setBorrador(null);
      toast.ok('Presupuestos guardados.');
    } catch (e) {
      toast.error('No se pudo guardar: ' + (e as Error).message);
    }
  }

  if (cargandoCat || cargandoPlan) return <ListadoEsqueleto filas={10} />;

  const nombreLinea = linea === 'CONDIMAR' ? 'Condimar' : 'Nidalca';

  return (
    <div className="tarjeta">
      <div className="barra-herramientas">
        <div>
          <div className="tarjeta-titulo" style={{ marginBottom: 2 }}>
            Presupuestos — {nombreLinea}
          </div>
          <div className="item-categoria">
            Metas de {MESES[mes - 1]} de {anio}. Las referencias van en cajas; el total, en
            pesos.
          </div>
        </div>

        <div className="filtros">
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {[anio - 1, anio, anio + 1].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primario"
            onClick={guardarTodo}
            disabled={!hayCambios || guardar.isPending}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      <div className="tabla-scroll tabla-alta">
        <table className="apilable">
          <thead>
            <tr>
              <th>Referencia</th>
              <th style={{ width: 160 }}>Meta (cajas)</th>
              <th style={{ width: 140 }}>Guardado</th>
            </tr>
          </thead>
          <tbody>
            {referencias.map((r) => (
              <tr key={r.id}>
                <td data-etiqueta="Referencia">
                  <div className="item-nombre">{r.etiqueta}</div>
                  <div className="item-categoria">{r.id}</div>
                </td>
                <td data-etiqueta="Meta en cajas">
                  <CampoNumero
                    valor={metaDe(r.id)}
                    min={0}
                    etiqueta={`Meta de ${r.etiqueta}`}
                    onCambiar={(n) => cambiar(r.id, n)}
                  />
                </td>
                <td data-etiqueta="Guardado" className="num apagado">
                  {guardados.get(r.id)?.metaCajas ?? 0}
                </td>
              </tr>
            ))}

            <tr className="fila-total">
              <td data-etiqueta="Referencia">
                <div className="item-nombre">TOTAL {linea}</div>
                <div className="item-categoria">meta en pesos</div>
              </td>
              <td data-etiqueta="Meta en pesos">
                <CampoNumero
                  valor={metaDe('TOTAL')}
                  min={0}
                  etiqueta={`Meta en pesos de ${nombreLinea}`}
                  onCambiar={(n) => cambiar('TOTAL', n)}
                />
              </td>
              <td data-etiqueta="Guardado" className="num apagado">
                {COP(guardados.get('TOTAL')?.metaPesos ?? 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {hayCambios && (
        <p className="nota" style={{ marginBottom: 0 }}>
          Hay cambios sin guardar. Al guardar se reescriben las metas de{' '}
          {MESES[mes - 1]} de {anio} para {nombreLinea}; los demás meses quedan como están.
        </p>
      )}
    </div>
  );
}
