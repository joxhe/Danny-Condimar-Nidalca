/** Pesos colombianos, redondeado al peso. */
export function COP(n: number | null | undefined): string {
  const v = n === null || n === undefined || Number.isNaN(n) ? 0 : n;
  return '$' + Math.round(v).toLocaleString('es-CO');
}

/** ISO (2026-09-22) a formato local (22/09/2026). */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

/** Fecha de hoy en ISO, en hora local (no UTC). */
export function todayISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Un pedido no se puede fechar antes de hoy.
 *
 * La comparacion es de texto porque el formato ISO ya ordena cronologicamente,
 * y asi no se arrastran zonas horarias: "2026-09-24" < "2026-09-25" siempre.
 */
export function fechaEsPasada(iso: string): boolean {
  return !!iso && iso < todayISO();
}

/** Adelanta a hoy una fecha vencida. Sirve al reabrir un borrador viejo. */
export function noAntesDeHoy(iso: string): string {
  return fechaEsPasada(iso) ? todayISO() : iso;
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
