/**
 * Analiza los dos Excel del cliente y propone la tabla canonica de referencias.
 *
 * El informe semanal cuenta CAJAS por referencia de empaque. Para llegar de una
 * linea de pedido a una fila del informe hacen falta dos saltos:
 *
 *   unidades  --(embalaje x caja)-->  cajas  --(referencia)-->  fila del informe
 *
 * El problema es que los dos archivos nombran las referencias distinto
 * ("4X72" en la lista de precios, "72 X 4" en el informe), y en algunos casos
 * la referencia del informe no se deduce del campo de referencia sino del
 * NOMBRE del producto ("OFERTA", "DESM", "COSTILLA").
 *
 * Por eso la llave no es un alias simple: es una regla.
 */
import * as XLSX from 'xlsx';
import fs from 'node:fs';

const [ARCHIVO_CATALOGO, ARCHIVO_INFORME] = process.argv.slice(2);

function hoja(archivo, nombre) {
  const wb = XLSX.read(new Uint8Array(fs.readFileSync(archivo)), { cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[nombre], {
    header: 1,
    defval: '',
    blankrows: false,
  });
}

/** Sin acentos, sin dobles espacios, en mayuscula. */
function limpiar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Forma canonica de una referencia de empaque.
 *
 * "72 X 4", "4X72" y "4 x 72" describen el mismo empaque con los factores en
 * distinto orden, asi que se reducen a los numeros ordenados. Lo que no es un
 * producto de dos factores se queda con su texto limpio.
 */
function canonizar(ref) {
  const limpio = limpiar(ref);
  if (!limpio) return '';
  const factores = limpio.match(/^(\d+)\s*[X]\s*(\d+)$/);
  if (factores) {
    const a = Number(factores[1]);
    const b = Number(factores[2]);
    return `${Math.min(a, b)}X${Math.max(a, b)}`;
  }
  if (/^\d+$/.test(limpio)) return limpio;
  return limpio;
}

// --------------------------------------------------------------------------
// 1. Catalogo Condimar: producto, embalaje por caja, referencia declarada
// --------------------------------------------------------------------------
const filasCatalogo = hoja(ARCHIVO_CATALOGO, 'lista de precios condimar').slice(2);
const productos = filasCatalogo
  .filter((r) => limpiar(r[0]))
  .map((r) => ({
    producto: limpiar(r[0]),
    embalaje: r[1],
    refDeclarada: limpiar(r[2]),
    canon: canonizar(r[2]),
    precio: Number(r[3]) || 0,
    iva: Number(r[4]) || 0,
    icui: Number(r[5]) || 0,
  }));

// --------------------------------------------------------------------------
// 2. Informe semanal: las filas que el cliente espera ver
// --------------------------------------------------------------------------
const filasInforme = hoja(ARCHIVO_INFORME, 'SEM 1').slice(4);
const FILAS_TOTAL = /^(TOTAL|GRAN TOTAL)/;
const referenciasInforme = filasInforme
  .map((r) => limpiar(r[0]))
  .filter((s) => s && !FILAS_TOTAL.test(s));

// --------------------------------------------------------------------------
// 3. Reglas propuestas. El orden importa: la primera que coincide, gana.
// --------------------------------------------------------------------------
const REGLAS = [
  // Se evaluan antes que las de empaque porque la oferta y el desmenuzado
  // comparten empaque con el producto normal y solo se distinguen por nombre.
  { informe: 'OF 24 X 12', cuando: (p) => /OFERTA/.test(p.producto) && p.canon === '12X24' },
  { informe: 'OF 36 X 8', cuando: (p) => /OFERTA/.test(p.producto) && p.canon === '8X36' },
  { informe: 'DESM 24 X 24', cuando: (p) => /\bDESM\b/.test(p.producto) },
  { informe: 'CALDO X KILO', cuando: (p) => /^CALDO/.test(p.producto) },
  { informe: 'COSTILLA', cuando: (p) => /^COSTILLA/.test(p.producto) && p.canon === 'TARRO' },
  { informe: 'TARRO GC', cuando: (p) => p.canon === 'TARRO' },

  // Reglas por empaque.
  { informe: '50x50', cuando: (p) => p.canon === '50X50' },
  { informe: '1x25', cuando: (p) => p.canon === '1X25' },
  { informe: '1x100', cuando: (p) => p.canon === '1X100' },
  { informe: '36 x 12', cuando: (p) => p.canon === '36' },
  { informe: '36 X 8', cuando: (p) => p.canon === '8X36' },
  { informe: '24 X 12', cuando: (p) => p.canon === '12X24' },
  { informe: '72 X 4', cuando: (p) => p.canon === '4X72' },
  { informe: 'BOLSA INST', cuando: (p) => p.canon === 'BOLSA INSTITUCIONAL' },
  { informe: 'COND X KILO', cuando: (p) => p.canon === 'COND X KILO' },
  { informe: 'FRASCO X 6', cuando: (p) => p.canon === '6' },
  { informe: '24 X 12', cuando: (p) => p.canon === '24' },
];

function clasificar(p) {
  const regla = REGLAS.find((r) => r.cuando(p));
  // Las etiquetas del informe se comparan limpias: en la hoja conviven
  // "50x50" y "36 x 12" con mayusculas y minusculas mezcladas.
  return regla ? limpiar(regla.informe) : null;
}

// --------------------------------------------------------------------------
// 3b. Nidalca: el informe agrupa por categoria del listado, no por empaque.
// --------------------------------------------------------------------------
const CATEGORIAS_NIDALCA = {
  LAMINADOS: ['ALIMENTO *250GR', 'OFERTAS *250GR', 'ALIMENTO & OFERTAS *1000GR'],
  INSTITUCIONAL: ['INSTITUCIONAL'],
  GRANEL: ['GRANEL'],
  ASEO: ['LINEA DE ASEO'],
  CANINOS: ['ACCESORIOS CANINOS'],
};

const filasNidalca = hoja(ARCHIVO_CATALOGO, 'Listado de Precios 2025');
let categoriaActual = '';
const productosNidalca = [];
for (const r of filasNidalca) {
  const a = limpiar(r[0]);
  const b = limpiar(r[1]);
  if (a && !b) { categoriaActual = a; continue; }   // encabezado de seccion
  if (!b || b === 'DESCRIPCION DEL PRODUCTO') continue;
  if (a) categoriaActual = a;
  productosNidalca.push({ categoria: categoriaActual, producto: b, precio: Number(r[2]) || 0, iva: Number(r[3]) || 0 });
}

// --------------------------------------------------------------------------
// 4. Resultado
// --------------------------------------------------------------------------
const porFila = new Map(referenciasInforme.map((r) => [r, []]));
const sinClasificar = [];

for (const p of productos) {
  const destino = clasificar(p);
  if (destino && porFila.has(destino)) porFila.get(destino).push(p);
  else if (destino) porFila.set(destino, [p]);
  else sinClasificar.push(p);
}

console.log('=========================================================');
console.log(' PROPUESTA DE MAPEO  (informe <- catalogo)');
console.log('=========================================================\n');

for (const fila of referenciasInforme) {
  const ps = porFila.get(fila) ?? [];
  const embalajes = [...new Set(ps.map((p) => String(p.embalaje)))];
  const marca = ps.length === 0 ? ' <-- SIN PRODUCTOS' : '';
  console.log(`${fila.padEnd(22)} ${String(ps.length).padStart(2)} producto(s)  embalaje: ${embalajes.join('/') || '-'}${marca}`);
  ps.slice(0, 3).forEach((p) => console.log(`   · ${p.producto}  [ref "${p.refDeclarada}"]`));
  if (ps.length > 3) console.log(`   · … y ${ps.length - 3} mas`);
}

console.log('\n--- NIDALCA: el informe agrupa por categoria, no por empaque ---');
for (const [fila, cats] of Object.entries(CATEGORIAS_NIDALCA)) {
  const ps = productosNidalca.filter((p) =>
    cats.some((c) => limpiar(c) === limpiar(p.categoria)),
  );
  const ivas = [...new Set(ps.map((p) => Math.round(p.iva * 100) + '%'))];
  console.log(
    `${fila.padEnd(16)} ${String(ps.length).padStart(3)} producto(s)  IVA ${ivas.join('/') || '-'}  <- ${cats.join(' + ')}`,
  );
}
const catsMapeadas = new Set(Object.values(CATEGORIAS_NIDALCA).flat().map(limpiar));
const huerfanas = [...new Set(productosNidalca.map((p) => limpiar(p.categoria)))].filter(
  (c) => c && c !== 'CATEGORIA' && !catsMapeadas.has(c),
);
console.log('Categorias Nidalca sin fila :', huerfanas.length ? huerfanas.join(', ') : 'ninguna');
console.log('Productos Nidalca totales   :', productosNidalca.length);

console.log('\n--- PRODUCTOS SIN FILA EN EL INFORME ---');
if (sinClasificar.length === 0) console.log('ninguno');
sinClasificar.forEach((p) =>
  console.log(`  ${p.producto.padEnd(30)} ref "${p.refDeclarada}"  embalaje ${p.embalaje}`),
);

const conProductos = referenciasInforme.filter((f) => (porFila.get(f) ?? []).length > 0).length;
console.log('\n=========================================================');
console.log(` Filas del informe cubiertas : ${conProductos}/${referenciasInforme.length}`);
console.log(` Productos mapeados          : ${productos.length - sinClasificar.length}/${productos.length}`);
console.log('=========================================================');
