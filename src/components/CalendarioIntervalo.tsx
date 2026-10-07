import { useState } from 'react';
import {
  MESES,
  cuadriculaDelMes,
  diaDeLaSemana,
  mismoMes,
  moverMes,
  nombreDelDia,
  tocarDia,
  type Periodo,
} from '../domain';

const CABECERA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

interface Props {
  /** El periodo vigente: se ve pintado al abrir. */
  periodo: Periodo;
  onElegir: (periodo: Periodo) => void;
  hoy: string;
  /** Dias con pedidos finalizados: llevan un punto debajo del numero. */
  conVentas: ReadonlySet<string>;
}

/**
 * Calendario para elegir un intervalo: un toque en el primer dia y otro en el
 * ultimo.
 *
 * Hecho a mano porque el selector de fecha del navegador elige un solo dia:
 * harian falta dos, y nada impediria un "hasta" anterior al "desde" o de otro
 * mes. Aqui el intervalo se ve pintado mientras se arma y no puede cruzar de
 * mes (ver `tocarDia`).
 */
export function CalendarioIntervalo({ periodo, onElegir, hoy, conVentas }: Props) {
  /** "2026-09" */
  const [mes, setMes] = useState(periodo.desde.slice(0, 7));
  /** Primer toque, a la espera del segundo. */
  const [inicio, setInicio] = useState<string | null>(null);
  /** Dia bajo el puntero: deja ver el intervalo antes del segundo toque. */
  const [encima, setEncima] = useState<string | null>(null);

  const anio = Number(mes.slice(0, 4));
  const numeroMes = Number(mes.slice(5, 7));

  let pintado = periodo;
  if (inicio) {
    const otro = encima && mismoMes(inicio, encima) ? encima : inicio;
    pintado = inicio <= otro ? { desde: inicio, hasta: otro } : { desde: otro, hasta: inicio };
  }

  function tocar(dia: string) {
    const r = tocarDia(inicio, dia);
    if ('periodo' in r) {
      setInicio(null);
      onElegir(r.periodo);
    } else {
      setInicio(r.inicio);
    }
  }

  return (
    <div className="calendario">
      <div className="calendario-mes">
        <button
          type="button"
          className="btn-fantasma"
          aria-label="Mes anterior"
          onClick={() => setMes(moverMes(mes, -1))}
        >
          ‹
        </button>
        <span aria-live="polite">
          {MESES[numeroMes - 1]} {anio}
        </span>
        <button
          type="button"
          className="btn-fantasma"
          aria-label="Mes siguiente"
          onClick={() => setMes(moverMes(mes, 1))}
        >
          ›
        </button>
      </div>

      <div className="calendario-rejilla" onMouseLeave={() => setEncima(null)}>
        {CABECERA.map((letra, i) => (
          <span key={i} className="calendario-cabecera" aria-hidden="true">
            {letra}
          </span>
        ))}

        {cuadriculaDelMes(anio, numeroMes)
          .flat()
          .map((dia, i) => {
            if (!dia) return <span key={i} />;

            const enRango = pintado.desde <= dia && dia <= pintado.hasta;
            const extremo = dia === pintado.desde || dia === pintado.hasta;
            const ventas = conVentas.has(dia);
            const clases = [
              'calendario-dia',
              enRango && 'en-rango',
              extremo && 'extremo',
              dia === hoy && 'hoy',
              diaDeLaSemana(dia) === 0 && 'domingo',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={dia}
                type="button"
                className={clases}
                aria-pressed={enRango}
                aria-label={nombreDelDia(dia) + (ventas ? ', con ventas' : '')}
                onClick={() => tocar(dia)}
                onMouseEnter={() => setEncima(dia)}
              >
                {Number(dia.slice(8))}
                {ventas && <span className="calendario-punto" aria-hidden="true" />}
              </button>
            );
          })}
      </div>

      <p className="calendario-ayuda" aria-live="polite">
        {inicio
          ? `Desde el ${nombreDelDia(inicio)}. Ahora toca el último día.`
          : 'Toca el primer día y después el último, dentro del mismo mes. Para un solo día, tócalo dos veces.'}
      </p>
    </div>
  );
}
