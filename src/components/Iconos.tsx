/**
 * Iconos en linea.
 *
 * Van como SVG dentro del bundle y no como fuente de iconos ni archivos
 * sueltos: son cuatro trazos, no justifican una descarga aparte, y asi heredan
 * el color del texto con `currentColor`.
 *
 * Todos son aria-hidden porque siempre acompañan a una etiqueta de texto o a
 * un `aria-label` del boton. Anunciarlos duplicaria la lectura.
 */
interface Props {
  tamano?: number;
}

function Svg({ tamano = 16, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Hoja con la esquina doblada y una flecha que baja: documento que se obtiene. */
export function IconoPdf(p: Props) {
  return (
    <Svg {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 12v5" />
      <path d="m9.5 14.5 2.5 2.5 2.5-2.5" />
    </Svg>
  );
}

export function IconoBorrar(p: Props) {
  return (
    <Svg {...p}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function IconoEditar(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </Svg>
  );
}

export function IconoOjo(p: Props) {
  return (
    <Svg {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function IconoMas(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconoImprimir(p: Props) {
  return (
    <Svg {...p}>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </Svg>
  );
}

/** Tres nodos unidos: el gesto de compartir de Android. */
export function IconoCompartir(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </Svg>
  );
}

export function IconoCalendario(p: Props) {
  return (
    <Svg {...p}>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M8 2.5v4M16 2.5v4" />
    </Svg>
  );
}

export function IconoAlerta(p: Props) {
  return (
    <Svg {...p}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </Svg>
  );
}
