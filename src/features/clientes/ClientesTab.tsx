import { useMemo, useState } from 'react';
import { useCatalogos, useGuardarClientes } from '../../api/queries';
import { CampoNumero } from '../../components/CampoNumero';
import { ListadoEsqueleto } from '../../components/Esqueleto';
import { CLIENTE_VACIO, type Cliente, type Linea } from '../../domain/types';
import { confirmar } from '../../store/dialogo';
import { toast } from '../../store/toast';

type Filtro = 'todos' | 'compraron' | 'no-compraron';

export function ClientesTab({ linea }: { linea: Linea }) {
  const { data: catalogos, isLoading } = useCatalogos();
  const guardar = useGuardarClientes();

  const [consulta, setConsulta] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [editando, setEditando] = useState<Cliente | null>(null);

  const clientes = catalogos.clientes[linea];

  const lista = useMemo(() => {
    const palabras = consulta.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return clientes
      .filter((c) =>
        filtro === 'todos' ? true : filtro === 'compraron' ? c.compro : !c.compro,
      )
      .filter((c) => {
        if (!palabras.length) return true;
        const texto = `${c.razon_social} ${c.nit} ${c.ciudad}`.toLowerCase();
        return palabras.every((w) => texto.includes(w));
      });
  }, [clientes, consulta, filtro]);

  /** Id correlativo para el alta. La hoja identifica por el, no por el NIT. */
  function siguienteId(): string {
    const prefijo = linea === 'CONDIMAR' ? 'CC' : 'CN';
    const max = clientes.reduce((m, c) => {
      const n = Number(String(c.id).split('-')[1]);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return `${prefijo}-${String(max + 1).padStart(3, '0')}`;
  }

  async function guardarCliente(cliente: Cliente) {
    if (!cliente.razon_social.trim()) {
      toast.error('La razón social es obligatoria.');
      return;
    }

    // Avisar, no bloquear: hay NIT repetidos legitimos en los datos actuales.
    const repetido = clientes.find((c) => c.nit === cliente.nit && c.id !== cliente.id);
    if (cliente.nit && repetido) {
      const seguir = await confirmar({
        titulo: 'NIT repetido',
        mensaje: `El NIT ${cliente.nit} ya lo tiene ${repetido.razon_social}. Puede ser legítimo, pero conviene revisarlo.`,
        confirmar: 'Guardar igual',
      });
      if (!seguir) return;
    }

    try {
      await guardar.mutateAsync({ linea, datos: [cliente] });
      setEditando(null);
      toast.ok('Cliente guardado.');
    } catch (e) {
      toast.error('No se pudo guardar: ' + (e as Error).message);
    }
  }

  if (isLoading) return <ListadoEsqueleto filas={8} />;

  const compraron = clientes.filter((c) => c.compro).length;

  return (
    <>
      {editando && (
        <FormularioCliente
          cliente={editando}
          onCambiar={setEditando}
          onGuardar={() => guardarCliente(editando)}
          onCancelar={() => setEditando(null)}
          guardando={guardar.isPending}
        />
      )}

      <div className="tarjeta">
        <div className="barra-herramientas">
          <div>
            <div className="tarjeta-titulo" style={{ marginBottom: 2 }}>
              Clientes — {linea === 'CONDIMAR' ? 'Condimar' : 'Nidalca'} ({lista.length} de{' '}
              {clientes.length})
            </div>
            <div className="item-categoria">
              {compraron} compraron este año · {clientes.length - compraron} sin comprar
            </div>
          </div>

          <div className="filtros">
            <input
              type="search"
              placeholder="Buscar por nombre, NIT o ciudad…"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
            />
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
              <option value="todos">Todos</option>
              <option value="compraron">Compraron</option>
              <option value="no-compraron">Sin comprar</option>
            </select>
            <button
              type="button"
              className="btn-primario"
              onClick={() => setEditando({ ...CLIENTE_VACIO, id: siguienteId() })}
            >
              + Cliente
            </button>
          </div>
        </div>

        {lista.length === 0 ? (
          <div className="vacio">Ningún cliente coincide con la búsqueda.</div>
        ) : (
          <div className="tabla-scroll tabla-alta">
            <table className="apilable">
              <thead>
                <tr>
                  <th>Razón social</th>
                  <th style={{ width: 130 }}>NIT</th>
                  <th style={{ width: 150 }}>Ciudad</th>
                  <th className="ocultar-movil">Dirección</th>
                  <th className="ocultar-movil" style={{ width: 120 }}>
                    Teléfono
                  </th>
                  <th style={{ width: 80 }}>Plazo</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td data-etiqueta="Razón social">
                      <div className="item-nombre">{c.razon_social}</div>
                      <div className="item-categoria">
                        {c.id}
                        {!c.compro && ' · sin comprar'}
                      </div>
                    </td>
                    <td data-etiqueta="NIT" className="num">
                      {c.nit}
                      {c.dv && <span className="dv">-{c.dv}</span>}
                    </td>
                    <td data-etiqueta="Ciudad">{c.ciudad}</td>
                    <td data-etiqueta="Dirección" className="ocultar-movil">
                      {c.direccion}
                    </td>
                    <td data-etiqueta="Teléfono" className="ocultar-movil num">
                      {c.telefono}
                    </td>
                    <td data-etiqueta="Plazo" className="num">
                      {c.plazo_credito} d
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-fantasma"
                        onClick={() => setEditando({ ...c })}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function FormularioCliente({
  cliente,
  onCambiar,
  onGuardar,
  onCancelar,
  guardando,
}: {
  cliente: Cliente;
  onCambiar: (c: Cliente) => void;
  onGuardar: () => void;
  onCancelar: () => void;
  guardando: boolean;
}) {
  const set = <K extends keyof Cliente>(campo: K) => (valor: Cliente[K]) =>
    onCambiar({ ...cliente, [campo]: valor });

  return (
    <div className="tarjeta tarjeta-formulario">
      <div className="tarjeta-titulo">
        {cliente.razon_social ? `Editar ${cliente.razon_social}` : 'Cliente nuevo'}
        <span className="item-categoria"> · {cliente.id}</span>
      </div>

      <div className="rejilla-formulario">
        <div className="campo-ancho">
          <label htmlFor="razon">Razón social o nombre *</label>
          <input
            id="razon"
            value={cliente.razon_social}
            onChange={(e) => set('razon_social')(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="nit">NIT o cédula</label>
          <input
            id="nit"
            value={cliente.nit}
            onChange={(e) => set('nit')(e.target.value)}
            inputMode="numeric"
          />
        </div>

        <div>
          <label htmlFor="dv">Dígito de verificación</label>
          <input
            id="dv"
            value={cliente.dv}
            maxLength={1}
            onChange={(e) => set('dv')(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
          />
        </div>

        <div className="campo-ancho">
          <label htmlFor="dir">Dirección</label>
          <input
            id="dir"
            value={cliente.direccion}
            onChange={(e) => set('direccion')(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="ciudad">Ciudad</label>
          <input
            id="ciudad"
            value={cliente.ciudad}
            onChange={(e) => set('ciudad')(e.target.value.toUpperCase())}
          />
        </div>

        <div>
          <label htmlFor="tel">Teléfono</label>
          <input
            id="tel"
            value={cliente.telefono}
            onChange={(e) => set('telefono')(e.target.value)}
            inputMode="tel"
          />
        </div>

        <div>
          <label htmlFor="plazo">Plazo de crédito (días)</label>
          <CampoNumero
            valor={cliente.plazo_credito}
            min={0}
            etiqueta="Plazo de crédito en días"
            onCambiar={set('plazo_credito')}
          />
        </div>

        <div className="campo-casilla">
          <label htmlFor="compro">
            <input
              id="compro"
              type="checkbox"
              checked={cliente.compro}
              onChange={(e) => set('compro')(e.target.checked)}
            />
            Compró este año
          </label>
        </div>
      </div>

      <div className="acciones">
        <button type="button" className="btn-fantasma" onClick={onCancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn-primario"
          onClick={onGuardar}
          disabled={guardando}
        >
          {guardando ? 'Guardando…' : 'Guardar cliente'}
        </button>
      </div>
    </div>
  );
}
