import { useEffect, useId, useMemo, useRef, useState } from 'react';

interface Props<T> {
  placeholder: string;
  items: T[];
  /** Texto principal de cada opcion. Es tambien lo que se busca. */
  etiqueta: (item: T) => string;
  /** Segunda linea: NIT y ciudad, o categoria y precio. Tambien se busca. */
  detalle?: (item: T) => string;
  onElegir: (item: T) => void;
  /** Si se pasa, el input muestra lo elegido cuando esta cerrado. */
  valor?: T | null;
  /** Vaciar el buscador despues de elegir. Util para agregar articulos. */
  limpiarAlElegir?: boolean;
  autoFocus?: boolean;
  /** Para poder enfocarlo desde otro punto de la pantalla. */
  inputId?: string;
}

const MAX_RESULTADOS = 40;

/**
 * Buscador con lista desplegable.
 *
 * Filtra por palabras sueltas y en cualquier orden: escribir "gil cerete"
 * encuentra al cliente aunque en la ficha la ciudad vaya despues del nombre.
 * Con 231 clientes eso es la diferencia entre encontrar y rendirse.
 */
export function Buscador<T>({
  placeholder,
  items,
  etiqueta,
  detalle,
  onElegir,
  valor,
  limpiarAlElegir,
  autoFocus,
  inputId,
}: Props<T>) {
  const [consulta, setConsulta] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const listaId = useId();

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  const resultados = useMemo(() => {
    const palabras = consulta.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!palabras.length) return items.slice(0, MAX_RESULTADOS);

    return items
      .filter((it) => {
        const texto = (etiqueta(it) + ' ' + (detalle ? detalle(it) : '')).toLowerCase();
        return palabras.every((p) => texto.includes(p));
      })
      .slice(0, MAX_RESULTADOS);
    // etiqueta y detalle se recrean en cada render del padre: no son dependencias utiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta, items]);

  useEffect(() => setResaltado(0), [consulta]);

  function elegir(item: T) {
    onElegir(item);
    setAbierto(false);
    setConsulta(limpiarAlElegir ? '' : etiqueta(item));
  }

  function teclas(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierto) return setAbierto(true);
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      setResaltado((i) => Math.min(Math.max(i + paso, 0), resultados.length - 1));
    } else if (e.key === 'Enter' && abierto && resultados[resaltado]) {
      e.preventDefault();
      elegir(resultados[resaltado]);
    } else if (e.key === 'Escape') {
      setAbierto(false);
    }
  }

  const texto = abierto ? consulta : valor ? etiqueta(valor) : consulta;

  return (
    <div className="buscador" ref={caja}>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={texto}
        autoFocus={autoFocus}
        onFocus={() => {
          setAbierto(true);
          setConsulta('');
        }}
        onChange={(e) => {
          setConsulta(e.target.value);
          setAbierto(true);
        }}
        onKeyDown={teclas}
      />

      {abierto && (
        <ul className="buscador-lista" id={listaId} role="listbox">
          {resultados.length === 0 && <li className="buscador-vacio">Sin resultados</li>}

          {resultados.map((it, i) => (
            <li
              key={i}
              role="option"
              aria-selected={i === resaltado}
              className={'buscador-opcion' + (i === resaltado ? ' resaltada' : '')}
              onMouseEnter={() => setResaltado(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(it)}
            >
              <span className="buscador-etiqueta">{etiqueta(it)}</span>
              {detalle && <span className="buscador-detalle">{detalle(it)}</span>}
            </li>
          ))}

          {items.length > resultados.length && consulta.trim() === '' && (
            <li className="buscador-vacio">
              Mostrando {resultados.length} de {items.length}. Escriba para filtrar.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
