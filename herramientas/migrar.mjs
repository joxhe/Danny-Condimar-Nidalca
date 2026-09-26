/**
 * Fusiona los dos Excel del cliente en un unico libro normalizado, listo para
 * subir a Drive y conectarle un solo Apps Script.
 *
 *   "archivo para app 2.0.xlsx"            -> los datos (precios y clientes)
 *   "RESUMEN SEMANAL DE VENTAS AGOSTO.xlsx" -> la forma del Informe y las metas
 *
 * Lo que sale no es una copia mas prolija de lo que entro: es un esquema
 * relacional. Cada entidad con id estable, los pedidos separados en cabecera y
 * renglones, y una tabla de referencias que resuelve que "4X72" en la lista de
 * precios y "72 X 4" en el Informe son el mismo empaque.
 *
 *   node herramientas/migrar.mjs
 */
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const CATALOGO = 'archivo para app 2.0.xlsx';
const INFORME = 'RESUMEN SEMANAL DE VENTAS AGOSTO.xlsx';
const SALIDA = 'BASE-DANNY-CONDIMAR.xlsx';

/** El Informe de muestra corresponde a septiembre, pese al nombre del archivo. */
const ANIO = 2026;
const MES = 9;

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------

function leerHoja(archivo, nombre) {
  const wb = XLSX.read(new Uint8Array(fs.readFileSync(archivo)), { cellDates: true });
  if (!wb.Sheets[nombre]) throw new Error(`No existe la hoja "${nombre}" en ${archivo}`);
  return XLSX.utils.sheet_to_json(wb.Sheets[nombre], {
    header: 1,
    defval: '',
    blankrows: false,
  });
}

function limpiar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(s) {
  return limpiar(s)
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** El IVA viene como 19 en Condimar y como 0.05 en Nidalca. Adentro, siempre %. */
function aPorcentaje(v) {
  const n = Number(v) || 0;
  return n > 0 && n < 1 ? Math.round(n * 10000) / 100 : n;
}

/** "4X72" y "72 X 4" son el mismo empaque: se reducen a los factores ordenados. */
function canonizar(ref) {
  const l = limpiar(ref);
  const f = l.match(/^(\d+)\s*X\s*(\d+)$/);
  if (f) {
    const a = Number(f[1]);
    const b = Number(f[2]);
    return `${Math.min(a, b)}X${Math.max(a, b)}`;
  }
  return l;
}

const avisos = [];
const aviso = (m) => avisos.push(m);

// --------------------------------------------------------------------------
// 1. Ciudades: canonizar antes de tocar a los clientes
// --------------------------------------------------------------------------

/** Variantes de la misma ciudad que aparecen escritas distinto en las hojas. */
const ALIAS_CIUDAD = {
  MOMPOS: ['MOMPOX'],
  'EL CARMEN DE BOLIVAR': ['EL CARMEN', 'CARMEN DE BOLIVAR'],
  'SAN JUAN DE NEPOMUCENO': ['SAN JUAN DE NEPOMUCE'],
};

const canonDeCiudad = new Map();
for (const [canon, alias] of Object.entries(ALIAS_CIUDAD)) {
  canonDeCiudad.set(limpiar(canon), canon);
  for (const a of alias) canonDeCiudad.set(limpiar(a), canon);
}

function ciudadCanonica(nombre) {
  const l = limpiar(nombre);
  return canonDeCiudad.get(l) ?? l;
}

// --------------------------------------------------------------------------
// 2. Referencias del Informe
// --------------------------------------------------------------------------

const filasInforme = leerHoja(INFORME, 'SEM 1').slice(4);
const ES_TOTAL = /^(TOTAL|GRAN TOTAL)/;

/** Filas Nidalca del Informe: agrupan por categoria del listado, no por empaque. */
const CATEGORIAS_NIDALCA = {
  LAMINADOS: ['ALIMENTO *250GR', 'OFERTAS *250GR', 'ALIMENTO & OFERTAS *1000GR'],
  INSTITUCIONAL: ['INSTITUCIONAL'],
  GRANEL: ['GRANEL'],
  ASEO: ['LINEA DE ASEO'],
  CANINOS: ['ACCESORIOS CANINOS'],
};
const ES_NIDALCA = new Set(Object.keys(CATEGORIAS_NIDALCA));

const referencias = [];
const presupuestos = [];
let orden = 0;

for (const fila of filasInforme) {
  const etiqueta = limpiar(fila[0]);
  if (!etiqueta) continue;

  const meta = Number(fila[4]) || 0;

  if (ES_TOTAL.test(etiqueta)) {
    // Las filas de total llevan la meta en pesos, no en cajas.
    const linea = etiqueta.includes('NIDALCA')
      ? 'NIDALCA'
      : etiqueta.includes('CONDIMAR')
        ? 'CONDIMAR'
        : 'AMBAS';
    presupuestos.push({
      linea,
      referencia_id: 'TOTAL',
      anio: ANIO,
      mes: MES,
      meta_cajas: '',
      meta_pesos: meta,
    });
    continue;
  }

  const linea = ES_NIDALCA.has(etiqueta) ? 'NIDALCA' : 'CONDIMAR';
  const id = slug(etiqueta);
  referencias.push({
    id,
    linea,
    etiqueta_informe: fila[0],
    orden: ++orden,
    activo: 'SI',
  });
  presupuestos.push({
    linea,
    referencia_id: id,
    anio: ANIO,
    mes: MES,
    meta_cajas: meta,
    meta_pesos: '',
  });
}

const idDeEtiqueta = new Map(referencias.map((r) => [limpiar(r.etiqueta_informe), r.id]));
const refId = (etiqueta) => idDeEtiqueta.get(limpiar(etiqueta)) ?? '';

// --------------------------------------------------------------------------
// 3. Productos Condimar: la referencia sale de una regla, no de un alias
// --------------------------------------------------------------------------

/**
 * El orden importa. Oferta y desmenuzado comparten empaque con el producto
 * normal, asi que solo se distinguen por el nombre y van primero.
 */
const REGLAS = [
  { ref: 'OF 24 X 12', si: (p) => /OFERTA/.test(p.nombre) && p.canon === '12X24' },
  { ref: 'OF 36 X 8', si: (p) => /OFERTA/.test(p.nombre) && p.canon === '8X36' },
  { ref: 'DESM 24 X 24', si: (p) => /\bDESM\b/.test(p.nombre) },
  { ref: 'CALDO X KILO', si: (p) => /^CALDO/.test(p.nombre) },
  { ref: 'COSTILLA', si: (p) => /^COSTILLA/.test(p.nombre) && p.canon === 'TARRO' },
  { ref: 'TARRO GC', si: (p) => p.canon === 'TARRO' },
  { ref: '50x50', si: (p) => p.canon === '50X50' },
  { ref: '1x25', si: (p) => p.canon === '1X25' },
  { ref: '1x100', si: (p) => p.canon === '1X100' },
  { ref: '36 x 12', si: (p) => p.canon === '36' },
  { ref: '36 X 8', si: (p) => p.canon === '8X36' },
  { ref: '24 X 12', si: (p) => p.canon === '12X24' },
  { ref: '72 X 4', si: (p) => p.canon === '4X72' },
  { ref: 'BOLSA INST', si: (p) => p.canon === 'BOLSA INSTITUCIONAL' },
  { ref: 'COND X KILO', si: (p) => p.canon === 'COND X KILO' },
  { ref: 'FRASCO X 6', si: (p) => p.canon === '6' },
  { ref: '24 X 12', si: (p) => p.canon === '24' },
];

const productos = [];
let nCondimar = 0;

for (const r of leerHoja(CATALOGO, 'lista de precios condimar').slice(2)) {
  const nombre = String(r[0] ?? '').trim();
  if (!nombre) continue;

  const candidato = { nombre: limpiar(nombre), canon: canonizar(r[2]) };
  const regla = REGLAS.find((x) => x.si(candidato));
  const referencia_id = regla ? refId(regla.ref) : '';

  if (!referencia_id) {
    aviso(`Producto Condimar sin referencia de Informe: "${nombre}" (ref "${r[2]}")`);
  }

  productos.push({
    id: `PC-${String(++nCondimar).padStart(3, '0')}`,
    linea: 'CONDIMAR',
    categoria: 'General',
    producto: nombre,
    precio: Number(r[3]) || 0,
    iva_pct: aPorcentaje(r[4]),
    icui_pct: aPorcentaje(r[5]),
    embalaje: r[1],
    referencia_id,
    activo: 'SI',
  });
}

// --------------------------------------------------------------------------
// 4. Productos Nidalca: la categoria arrastra hacia abajo
// --------------------------------------------------------------------------

const refDeCategoria = new Map();
for (const [etiqueta, cats] of Object.entries(CATEGORIAS_NIDALCA)) {
  for (const c of cats) refDeCategoria.set(limpiar(c), refId(etiqueta));
}

let categoriaActual = '';
let nNidalca = 0;

for (const r of leerHoja(CATALOGO, 'Listado de Precios 2025')) {
  const a = String(r[0] ?? '').trim();
  const b = String(r[1] ?? '').trim();

  if (a && !b) {
    categoriaActual = a; // encabezado de seccion
    continue;
  }
  if (!b || limpiar(b) === 'DESCRIPCION DEL PRODUCTO') continue;
  if (a) categoriaActual = a;

  const referencia_id = refDeCategoria.get(limpiar(categoriaActual)) ?? '';
  if (!referencia_id) {
    aviso(`Categoria Nidalca sin fila en el Informe: "${categoriaActual}"`);
  }

  productos.push({
    id: `PN-${String(++nNidalca).padStart(3, '0')}`,
    linea: 'NIDALCA',
    categoria: categoriaActual,
    producto: b,
    precio: Number(r[2]) || 0,
    iva_pct: aPorcentaje(r[3]),
    icui_pct: 0, // Nidalca no liquida ICUI
    embalaje: 1,
    referencia_id,
    activo: 'SI',
  });
}

// --------------------------------------------------------------------------
// 5. Clientes
// --------------------------------------------------------------------------

const clientes = [];
const ciudadesVistas = new Map();

for (const [hoja, linea, prefijo] of [
  ['clientes condimar', 'CONDIMAR', 'CC'],
  ['clientes nidalca', 'NIDALCA', 'CN'],
]) {
  let n = 0;
  for (const r of leerHoja(CATALOGO, hoja).slice(1)) {
    const razon = String(r[0] ?? '').trim();
    if (!razon) continue;

    // El NIT trae el digito de verificacion pegado: "70551145-1".
    const [nit, dv = ''] = String(r[1] ?? '').trim().split('-');
    const ciudad = ciudadCanonica(r[3]);
    if (ciudad) {
      ciudadesVistas.set(ciudad, (ciudadesVistas.get(ciudad) ?? 0) + 1);
    }

    clientes.push({
      id: `${prefijo}-${String(++n).padStart(3, '0')}`,
      linea,
      razon_social: razon,
      nit: nit.trim(),
      dv: dv.trim(),
      direccion: String(r[2] ?? '').trim(),
      ciudad,
      telefono: String(r[4] ?? '').trim(),
      plazo_credito: Number(r[5]) || 30,
      compro: /^s/i.test(String(r[7] ?? '')) ? 'SI' : 'NO',
      activo: 'SI',
    });
  }
}

const ciudades = [...ciudadesVistas.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([nombre, cuantos]) => ({
    id: slug(nombre),
    nombre,
    alias: (ALIAS_CIUDAD[nombre] ?? []).join(' | '),
    clientes: cuantos,
  }));

// --------------------------------------------------------------------------
// 6. Empresa
// --------------------------------------------------------------------------

const logos = leerHoja(CATALOGO, 'LOGOS');
const valorLogo = (col, clave) => {
  const f = logos.find((r) => limpiar(r[col]) === limpiar(clave));
  return f ? String(f[col + 1] ?? '').trim() : '';
};

const parametros = [
  {
    linea: 'CONDIMAR',
    nombre: 'Condimar S.A.S',
    nit: valorLogo(0, 'nit') || '890.113.075-7',
    direccion: valorLogo(0, 'direccion'),
    telefono: valorLogo(0, 'telefonos'),
    email: valorLogo(0, 'email'),
  },
  {
    linea: 'NIDALCA',
    nombre: 'Nidalca S.A.',
    nit: valorLogo(3, 'nit') || '802.024.512-2',
    direccion: valorLogo(3, 'direccion'),
    telefono: valorLogo(3, 'telefonos'),
    email: valorLogo(3, 'email'),
  },
];

// --------------------------------------------------------------------------
// 7. Cortes semanales: el cliente registra los sabados
// --------------------------------------------------------------------------

const cortes = [];
const wbInforme = XLSX.read(new Uint8Array(fs.readFileSync(INFORME)), { cellDates: true });
wbInforme.SheetNames.forEach((nombre, i) => {
  const filas = XLSX.utils.sheet_to_json(wbInforme.Sheets[nombre], {
    header: 1,
    defval: '',
    blankrows: false,
  });
  // La primera celda trae "5 de Septiembre MONTERIA".
  const titulo = String(filas[0]?.[0] ?? '').trim();
  const ciudad = titulo.split(/\s+/).slice(3).join(' ');
  cortes.push({
    id: `${ANIO}-${String(MES).padStart(2, '0')}-S${i + 1}`,
    anio: ANIO,
    mes: MES,
    semana: i + 1,
    titulo,
    ciudad: ciudadCanonica(ciudad),
    cerrado: 'NO',
  });
});

// --------------------------------------------------------------------------

// --------------------------------------------------------------------------

/*
 * Vista materializada, no fuente de verdad. La app la recalcula y la reescribe
 * entera en cada corte, para que al abrir el Sheet se vean las cifras en el
 * formato de siempre sin tener que entrar a la aplicacion.
 *
 * Nunca se edita a mano: lo que se escriba aqui se pierde en el proximo corte.
 */
const SECCIONES = [
  { linea: 'CONDIMAR', total: 'TOTAL CONDIMAR' },
  { linea: 'NIDALCA', total: 'TOTAL NIDALCA' },
];

const informe = [];
for (const { linea, total } of SECCIONES) {
  for (const r of referencias.filter((x) => x.linea === linea)) {
    const meta = presupuestos.find((p) => p.referencia_id === r.id);
    informe.push({
      corte_id: '',
      linea,
      orden: r.orden,
      referencia_id: r.id,
      referencia: r.etiqueta_informe,
      unidad: 'cajas',
      acum_anterior: '',
      ventas_semana: '',
      nuevo_acumulado: '',
      presupuesto: meta?.meta_cajas ?? 0,
      pct_cumplimiento: '',
      falta: '',
    });
  }
  const metaPesos = presupuestos.find((p) => p.linea === linea && p.referencia_id === 'TOTAL');
  informe.push({
    corte_id: '',
    linea,
    orden: 999,
    referencia_id: 'TOTAL',
    referencia: total,
    unidad: 'pesos',
    acum_anterior: '',
    ventas_semana: '',
    nuevo_acumulado: '',
    presupuesto: metaPesos?.meta_pesos ?? 0,
    pct_cumplimiento: '',
    falta: '',
  });
}

// --------------------------------------------------------------------------
// 8. Tablas vacias: se llenan desde la app
// --------------------------------------------------------------------------

const CABECERA_PEDIDOS = [
  'id', 'numero', 'linea', 'cliente_id', 'fecha', 'corte_id', 'estado',
  'obs_generales', 'bruto', 'descuento', 'subtotal', 'iva', 'icui', 'total',
  'updated_at',
];

/*
 * El Informe es una vista calculada: la app la reescribe entera en cada corte.
 * Sembrarla con filas de plantilla solo dejaba renglones sin corte que nadie
 * reclamaba despues.
 */
const CABECERA_INFORME = [
  'corte_id', 'linea', 'orden', 'referencia_id', 'referencia', 'unidad',
  'acum_anterior', 'ventas_semana', 'nuevo_acumulado', 'presupuesto',
  'pct_cumplimiento', 'falta',
];

const CABECERA_ITEMS = [
  'id', 'pedido_id', 'producto_id', 'producto', 'categoria', 'referencia_id',
  'precio', 'iva_pct', 'icui_pct', 'embalaje', 'cantidad', 'descuento_pct',
  'observaciones',
];

// --------------------------------------------------------------------------
// 9. Escribir el libro
// --------------------------------------------------------------------------

const wb = XLSX.utils.book_new();
const agregar = (nombre, filas, cabecera) => {
  const ws = filas.length
    ? XLSX.utils.json_to_sheet(filas)
    : XLSX.utils.aoa_to_sheet([cabecera]);
  XLSX.utils.book_append_sheet(wb, ws, nombre);
};

agregar('parametros', parametros);
agregar('referencias', referencias);
agregar('productos', productos);
agregar('clientes', clientes);
agregar('ciudades', ciudades);
agregar('presupuestos', presupuestos);
agregar('cortes', cortes);
agregar('informe', [], CABECERA_INFORME)
agregar('pedidos', [], CABECERA_PEDIDOS);
agregar('pedido_items', [], CABECERA_ITEMS);

// XLSX.writeFile falla en este entorno: se arma el buffer y lo escribe fs.
fs.writeFileSync(SALIDA, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

// --------------------------------------------------------------------------
// Resumen
// --------------------------------------------------------------------------

const sinRef = productos.filter((p) => !p.referencia_id).length;

console.log(`\n  ${path.resolve(SALIDA)}\n`);
console.log('  pestaña         filas');
console.log('  ------------------------');
for (const [n, f] of [
  ['parametros', parametros.length],
  ['referencias', referencias.length],
  ['productos', productos.length],
  ['clientes', clientes.length],
  ['ciudades', ciudades.length],
  ['presupuestos', presupuestos.length],
  ['cortes', cortes.length],
  ['informe', 0],
  ['pedidos', 0],
  ['pedido_items', 0],
]) {
  console.log(`  ${n.padEnd(15)} ${String(f).padStart(5)}`);
}

console.log(`\n  Condimar : ${nCondimar} productos`);
console.log(`  Nidalca  : ${nNidalca} productos`);
console.log(`  Sin referencia de Informe: ${sinRef}`);

if (avisos.length) {
  console.log('\n  AVISOS');
  [...new Set(avisos)].forEach((a) => console.log('   · ' + a));
}
console.log();
