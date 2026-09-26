import { useState } from 'react';
import { Dialogo } from './components/Dialogo';
import { Toasts } from './components/Toast';
import logoCondimar from './images/Condimar.png';
import logoNidalca from './images/Nidalca.png';
import { EMPRESAS, type Linea } from './domain/types';
import { CatalogoTab } from './features/catalogo/CatalogoTab';
import { ClientesTab } from './features/clientes/ClientesTab';
import { ConfigTab } from './features/config/ConfigTab';
import { InformeTab } from './features/informe/InformeTab';
import { PedidoTab } from './features/pedido/PedidoTab';
import { PedidosTab } from './features/pedidos/PedidosTab';
import { PresupuestosTab } from './features/presupuestos/PresupuestosTab';
import { ReferenciasTab } from './features/referencias/ReferenciasTab';
import { confirmar } from './store/dialogo';
import { usePedidoBorrador } from './store/pedidoBorrador';

/**
 * Armazon de la aplicacion.
 *
 * Sin separacion de roles: el vendedor captura los pedidos y tambien arma el
 * Informe que le entrega a sus superiores, asi que ve todas las pestañas.
 */

type Pestana =
  | 'pedido'
  | 'pedidos'
  | 'clientes'
  | 'catalogo'
  | 'informe'
  | 'presupuestos'
  | 'referencias'
  | 'config';

/** En el header basta la URL: no hay motor de PDF que dependa de descargarla. */
const LOGOS: Record<Linea, string> = {
  CONDIMAR: logoCondimar,
  NIDALCA: logoNidalca,
};

const PESTANAS: { id: Pestana; etiqueta: string }[] = [
  { id: 'pedido', etiqueta: 'Nuevo pedido' },
  { id: 'pedidos', etiqueta: 'Pedidos' },
  { id: 'clientes', etiqueta: 'Clientes' },
  { id: 'catalogo', etiqueta: 'Catálogo' },
  // El cliente lo llama asi: es el tablero de cumplimiento por referencia.
  { id: 'informe', etiqueta: 'Informe' },
  { id: 'presupuestos', etiqueta: 'Presupuestos' },
  { id: 'referencias', etiqueta: 'Referencias' },
  { id: 'config', etiqueta: 'Configuración' },
];

function ConmutadorLinea({
  linea,
  onCambiar,
}: {
  linea: Linea;
  onCambiar: (l: Linea) => void;
}) {
  return (
    <div className="conmutador" role="group" aria-label="Empresa">
      {(['CONDIMAR', 'NIDALCA'] as const).map((l) => (
        <button
          key={l}
          type="button"
          className={'conmutador-opcion' + (linea === l ? ' activa' : '')}
          aria-pressed={linea === l}
          onClick={() => onCambiar(l)}
        >
          {l === 'CONDIMAR' ? 'Condimar' : 'Nidalca'}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const [pestana, setPestana] = useState<Pestana>('pedido');
  const linea = usePedidoBorrador((s) => s.linea);
  const setLinea = usePedidoBorrador((s) => s.setLinea);
  const tieneContenido = usePedidoBorrador((s) => s.tieneContenido);

  const empresa = EMPRESAS[linea];

  async function cambiarLinea(nueva: Linea) {
    if (nueva === linea) return;
    // Cambiar de empresa descarta el pedido: los catalogos no son compatibles.
    if (tieneContenido()) {
      const seguir = await confirmar({
        titulo: 'Cambiar de empresa',
        mensaje:
          'El pedido que está armando se descarta, porque los catálogos de Condimar y Nidalca no son compatibles.',
        confirmar: 'Cambiar y descartar',
        peligro: true,
      });
      if (!seguir) return;
    }
    setLinea(nueva);
  }

  return (
    <div data-linea={linea} className="app">
      <header className="encabezado">
        <div className="contenedor encabezado-fila">
          <div className="encabezado-marca-bloque">
            <img
              className="encabezado-logo"
              src={LOGOS[linea]}
              alt={empresa.nombre}
              width={64}
              height={44}
            />
            <div>
              <h1 className="encabezado-marca">{empresa.nombre}</h1>
              <p className="encabezado-datos">
                NIT {empresa.nit} · {empresa.direccion}
              </p>
            </div>
          </div>
          <ConmutadorLinea linea={linea} onCambiar={cambiarLinea} />
        </div>
      </header>

      <nav className="navegacion" aria-label="Secciones">
        <div className="contenedor navegacion-fila">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={'nav-boton' + (pestana === p.id ? ' activa' : '')}
              aria-current={pestana === p.id ? 'page' : undefined}
              onClick={() => setPestana(p.id)}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
      </nav>

      <main className="contenedor contenido">
        {pestana === 'pedido' && <PedidoTab />}
        {pestana === 'pedidos' && <PedidosTab onEditar={() => setPestana('pedido')} />}
        {pestana === 'clientes' && <ClientesTab linea={linea} />}
        {pestana === 'catalogo' && <CatalogoTab linea={linea} />}
        {pestana === 'informe' && <InformeTab />}
        {pestana === 'presupuestos' && <PresupuestosTab linea={linea} />}
        {pestana === 'referencias' && <ReferenciasTab linea={linea} />}
        {pestana === 'config' && <ConfigTab />}
      </main>

      <Toasts />
      <Dialogo />
    </div>
  );
}
