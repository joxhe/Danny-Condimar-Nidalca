import { useEffect, useState } from 'react';

interface Props {
  valor: number;
  onCambiar: (n: number) => void;
  min?: number;
  max?: number;
  etiqueta?: string;
  id?: string;
  /** Al pulsar Enter. En el pedido devuelve el foco al buscador. */
  onEnter?: () => void;
}

/**
 * Campo numerico que no deja ceros pegados adelante.
 *
 * React no normaliza el texto de un `<input type="number">`: para decidir si
 * pisa el DOM compara con `!=`, y "0100" != 100 da falso porque el texto se
 * convierte a numero antes de comparar. Le parecen iguales y deja el cero.
 *
 * Por eso el texto se lleva aparte del numero: adentro se guarda lo que el
 * usuario ve, y hacia afuera siempre sale un numero limpio.
 */
export function CampoNumero({
  valor,
  onCambiar,
  min = 0,
  max,
  etiqueta,
  id,
  onEnter,
}: Props) {
  const [texto, setTexto] = useState(() => String(valor));

  // Si el valor cambia desde afuera (al abrir un borrador, por ejemplo) el
  // texto lo sigue. La comparacion es numerica para no pelearse con "" ni "05".
  useEffect(() => {
    if (Number(texto) !== valor) setTexto(String(valor));
    // El texto es estado propio: seguirlo aca provocaria un bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  function acotar(n: number): number {
    if (max !== undefined && n > max) return max;
    if (n < min) return min;
    return n;
  }

  function alEscribir(e: React.ChangeEvent<HTMLInputElement>) {
    const crudo = e.target.value;

    // Se permite vaciar el campo para poder reescribirlo sin pelear con el 0.
    if (crudo === '') {
      setTexto('');
      onCambiar(min);
      return;
    }

    const limpio = crudo.replace(/^0+(?=\d)/, '');
    const n = Number(limpio);
    if (!Number.isFinite(n)) return;

    setTexto(limpio);
    onCambiar(acotar(n));
  }

  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      value={texto}
      aria-label={etiqueta}
      onChange={alEscribir}
      // Al salir, un campo vacio vuelve al minimo en vez de quedar en blanco.
      onBlur={() => setTexto(String(valor))}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}
