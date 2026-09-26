/**
 * API de la hoja BASE-DANNY-CONDIMAR.
 *
 * Se copia y pega el archivo completo; no hay parches parciales.
 *
 * Pegar este archivo completo en el editor de Apps Script del Google Sheet
 * (Extensiones > Apps Script), reemplazando lo que haya.
 *
 * Publicar:  Implementar > Nueva implementacion > Aplicacion web
 *            Ejecutar como:  Yo
 *            Quien tiene acceso:  Cualquier usuario
 *
 * La URL que queda termina en /exec y es la que va en VITE_API_URL.
 *
 * -------------------------------------------------------------------------
 * Dos decisiones que conviene tener presentes:
 *
 * 1. Aca NO se calcula el Informe. La conversion de unidades a cajas y la
 *    politica de acumulacion viven en el dominio de la aplicacion, con tests.
 *    Duplicarlas aqui garantizaria que tarde o temprano difieran. Este script
 *    entrega los renglones y guarda el resultado ya calculado.
 *
 * 2. Se escribe por ID, no reescribiendo listas completas. La version anterior
 *    mandaba los 174 clientes en cada guardado, y el ultimo en escribir pisaba
 *    al anterior.
 * -------------------------------------------------------------------------
 */

/**
 * Version de este archivo.
 *
 * `ping` la devuelve, asi que se puede comprobar que version esta publicada
 * sin abrir el editor. Si el `ping` responde una version distinta a la de
 * aqui, falta republicar.
 *
 *   1.7.0  upsert mezcla con la fila existente: no borra columnas ausentes
 *   1.6.0  eliminarCliente, solo para clientes sin pedidos
 *   1.5.0  borrado por bloques y eliminarPedidos para varios a la vez
 *   1.4.0  guardarInforme limpia las filas sin corte y ordena la pestaña
 *   1.3.0  se elimina la pestaña `comparativos`
 *   1.2.0  guardarPedido escribe producto_id y referencia_id (venian vacios)
 *   1.1.0  pedidos con el cliente unido y la fecha sin hora
 *   1.0.0  version inicial
 */
const VERSION = '1.7.0';

const HOJA = {
  parametros: 'parametros',
  referencias: 'referencias',
  productos: 'productos',
  clientes: 'clientes',
  ciudades: 'ciudades',
  presupuestos: 'presupuestos',
  cortes: 'cortes',
  informe: 'informe',
  pedidos: 'pedidos',
  items: 'pedido_items',
};

// ==========================================================================
// Entrada
// ==========================================================================

function doGet(e) {
  return responder(function () {
    const accion = (e && e.parameter && e.parameter.accion) || '';
    switch (accion) {
      case 'catalogos':
        return catalogos();
      case 'pedidos':
        return { pedidos: pedidosConItems() };
      case 'planeacion':
        return planeacion();
      case 'informe':
        return { informe: leer(HOJA.informe) };
      case 'ping':
        return {
          ok: true,
          version: VERSION,
          hoja: SpreadsheetApp.getActiveSpreadsheet().getName(),
        };
      default:
        throw new Error('Accion desconocida: "' + accion + '"');
    }
  });
}

function doPost(e) {
  return responder(function () {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Cuerpo vacio');
    const p = JSON.parse(e.postData.contents);

    switch (p.accion) {
      case 'siguienteNumero':
        return { numero: siguienteNumero(p.linea) };
      case 'guardarPedido':
        return guardarPedido(p.pedido);
      case 'eliminarPedido':
        return eliminarPedido(p.id);
      case 'eliminarPedidos':
        return eliminarPedidos(p.ids);
      case 'eliminarCliente':
        return eliminarCliente(p.id);
      case 'guardarClientes':
        return { guardados: upsert(HOJA.clientes, p.datos) };
      case 'guardarProductos':
        return { guardados: upsert(HOJA.productos, p.datos) };
      case 'guardarPresupuestos':
        return { guardados: reemplazarTodo(HOJA.presupuestos, p.datos) };
      case 'guardarCortes':
        return { guardados: upsert(HOJA.cortes, p.datos) };
      case 'guardarInforme':
        return guardarInforme(p.corte_id, p.filas);
      default:
        throw new Error('Accion desconocida: "' + p.accion + '"');
    }
  });
}

/** Envuelve todo: la app espera JSON siempre, tambien cuando algo falla. */
function responder(fn) {
  let salida;
  try {
    salida = fn();
  } catch (err) {
    salida = { error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(salida)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// ==========================================================================
// Acceso generico a las pestañas
// ==========================================================================

function hoja(nombre) {
  const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!h) throw new Error('Falta la pestaña "' + nombre + '" en la hoja de calculo');
  return h;
}

/** Lee una pestaña completa usando la primera fila como nombres de campo. */
function leer(nombre) {
  const datos = hoja(nombre).getDataRange().getValues();
  if (datos.length < 2) return [];

  const campos = datos[0].map(function (c) {
    return String(c).trim();
  });

  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];
    // Una fila sin ningun valor es relleno del final de la hoja.
    if (
      fila.every(function (c) {
        return c === '' || c === null;
      })
    ) {
      continue;
    }
    const obj = {};
    for (let j = 0; j < campos.length; j++) {
      if (campos[j]) obj[campos[j]] = fila[j];
    }
    filas.push(obj);
  }
  return filas;
}

function cabecera(nombre) {
  const h = hoja(nombre);
  return h
    .getRange(1, 1, 1, h.getLastColumn())
    .getValues()[0]
    .map(function (c) {
      return String(c).trim();
    });
}

/** Ordena un objeto segun la cabecera de la pestaña. */
function aFila(obj, campos) {
  return campos.map(function (c) {
    const v = obj[c];
    return v === undefined || v === null ? '' : v;
  });
}

/** Clave compuesta, para las tablas cuya identidad no es un solo `id`. */
function clave(obj, campos) {
  return campos
    .map(function (c) {
      return String(obj[c] === undefined ? '' : obj[c]).trim();
    })
    .join('\u0001');
}

/**
 * Inserta o actualiza por clave. Las filas que ya existen se reescriben en su
 * sitio; las nuevas se agregan al final, todas de una sola escritura.
 */
function upsert(nombre, filas, campoClave) {
  if (!filas || !filas.length) return 0;

  const campos = campoClave || ['id'];
  const h = hoja(nombre);
  const cols = cabecera(nombre);
  const existentes = leer(nombre);

  const posicion = {};
  for (let i = 0; i < existentes.length; i++) {
    posicion[clave(existentes[i], campos)] = i + 2; // +2: cabecera y base 1
  }

  const nuevas = [];
  for (let i = 0; i < filas.length; i++) {
    const k = clave(filas[i], campos);
    const fila = posicion[k]
      ? // Al actualizar se MEZCLA con lo que ya estaba: una columna que no
        // venga en el objeto conserva su valor en vez de quedar vacia.
        aFila(fusionar(existentes[posicion[k] - 2], filas[i], cols), cols)
      : aFila(filas[i], cols);

    if (posicion[k]) h.getRange(posicion[k], 1, 1, cols.length).setValues([fila]);
    else nuevas.push(fila);
  }

  if (nuevas.length) {
    h.getRange(h.getLastRow() + 1, 1, nuevas.length, cols.length).setValues(nuevas);
  }
  return filas.length;
}

/**
 * Combina la fila existente con la nueva, campo por campo.
 *
 * Solo pisa lo que venga definido. Sin esto, mandar un objeto al que le falta
 * una columna la dejaba vacia: un simple error de nombre borraba datos en vez
 * de no tocarlos. Para vaciar un campo a proposito hay que mandarlo como "".
 */
function fusionar(existente, nuevo, cols) {
  const salida = {};
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    salida[c] = nuevo[c] === undefined || nuevo[c] === null ? existente[c] : nuevo[c];
  }
  return salida;
}

/** Vacia la pestaña (menos la cabecera) y escribe las filas dadas. */
function reemplazarTodo(nombre, filas) {
  const h = hoja(nombre);
  const cols = cabecera(nombre);

  if (h.getLastRow() > 1) {
    h.getRange(2, 1, h.getLastRow() - 1, cols.length).clearContent();
  }
  if (!filas || !filas.length) return 0;

  const valores = filas.map(function (f) {
    return aFila(f, cols);
  });
  h.getRange(2, 1, valores.length, cols.length).setValues(valores);
  return valores.length;
}

/** Borra las filas cuya columna `campo` valga `valor`. */
function borrarDonde(nombre, campo, valor) {
  return borrarDondeAlguno(nombre, campo, [valor]);
}

/**
 * Borra las filas cuya columna `campo` este entre los valores dados.
 *
 * Borra por bloques contiguos y de abajo hacia arriba, en vez de fila por
 * fila. Cada deleteRow es una llamada al servicio de hojas y es lo que hace
 * lento el borrado: eliminar 30 renglones pasa de 30 llamadas a una o dos.
 */
function borrarDondeAlguno(nombre, campo, valores) {
  const h = hoja(nombre);
  const cols = cabecera(nombre);
  const col = cols.indexOf(campo);
  if (col < 0) throw new Error('La pestaña "' + nombre + '" no tiene "' + campo + '"');

  const buscados = {};
  for (let i = 0; i < valores.length; i++) {
    buscados[String(valores[i]).trim()] = true;
  }

  const datos = h.getDataRange().getValues();
  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    if (buscados[String(datos[i][col]).trim()]) filas.push(i + 1); // fila de la hoja
  }
  if (!filas.length) return 0;

  // De mayor a menor: asi los indices de lo que queda arriba no se corren.
  let borradas = 0;
  let fin = filas[filas.length - 1];
  let inicio = fin;

  for (let i = filas.length - 2; i >= 0; i--) {
    if (filas[i] === inicio - 1) {
      inicio = filas[i]; // sigue el bloque
      continue;
    }
    h.deleteRows(inicio, fin - inicio + 1);
    borradas += fin - inicio + 1;
    fin = filas[i];
    inicio = fin;
  }
  h.deleteRows(inicio, fin - inicio + 1);
  borradas += fin - inicio + 1;

  return borradas;
}

// ==========================================================================
// Lecturas
// ==========================================================================

function catalogos() {
  const productos = leer(HOJA.productos);
  const clientes = leer(HOJA.clientes);
  const activos = function (f) {
    return String(f.activo).toUpperCase() !== 'NO';
  };
  const deLinea = function (linea) {
    return function (f) {
      return String(f.linea).toUpperCase() === linea;
    };
  };

  return {
    parametros: leer(HOJA.parametros),
    referencias: leer(HOJA.referencias),
    ciudades: leer(HOJA.ciudades),
    productosCondimar: productos.filter(activos).filter(deLinea('CONDIMAR')),
    productosNidalca: productos.filter(activos).filter(deLinea('NIDALCA')),
    clientesCondimar: clientes.filter(activos).filter(deLinea('CONDIMAR')),
    clientesNidalca: clientes.filter(activos).filter(deLinea('NIDALCA')),
  };
}

function planeacion() {
  return {
    cortes: leer(HOJA.cortes),
    presupuestos: leer(HOJA.presupuestos),
  };
}

/**
 * Pedidos con sus renglones anidados.
 *
 * Se arma el indice en memoria en vez de recorrer los items por cada pedido:
 * con un año de operacion la diferencia entre lineal y cuadratico se nota.
 */
function pedidosConItems() {
  const pedidos = leer(HOJA.pedidos);
  const items = leer(HOJA.items);
  const clientes = leer(HOJA.clientes);

  const porPedido = {};
  for (let i = 0; i < items.length; i++) {
    const id = String(items[i].pedido_id);
    if (!porPedido[id]) porPedido[id] = [];
    porPedido[id].push(items[i]);
  }

  const porCliente = {};
  for (let i = 0; i < clientes.length; i++) {
    porCliente[String(clientes[i].id)] = clientes[i];
  }

  return pedidos.map(function (p) {
    p.items = porPedido[String(p.id)] || [];
    // El documento necesita al cliente completo, no solo su id: la direccion
    // y el telefono van impresos en el pedido.
    p.cliente = porCliente[String(p.cliente_id)] || null;
    // Sheets convierte "2026-09-25" en fecha y sale como instante ISO.
    // Se devuelve la fecha civil, que es lo unico que significa aca.
    p.fecha = soloFecha(p.fecha);
    return p;
  });
}

/** Un Date de Sheets a "aaaa-mm-dd", en la zona de la hoja. */
function soloFecha(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) !== '[object Date]') return String(v).slice(0, 10);
  const z = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return Utilities.formatDate(v, z, 'yyyy-MM-dd');
}

// ==========================================================================
// Escrituras
// ==========================================================================

/**
 * Numeracion por linea.
 *
 * Con un solo usuario el candado es casi ceremonial, pero cuesta nada y evita
 * que dos pestañas abiertas del mismo navegador saquen el mismo numero.
 */
function siguienteNumero(linea) {
  const candado = LockService.getScriptLock();
  candado.waitLock(10000);
  try {
    const pedidos = leer(HOJA.pedidos);
    let max = 0;
    for (let i = 0; i < pedidos.length; i++) {
      if (String(pedidos[i].linea).toUpperCase() !== String(linea).toUpperCase()) continue;
      const n = Number(pedidos[i].numero);
      if (!isNaN(n) && n > max) max = n;
    }
    return max + 1;
  } finally {
    candado.releaseLock();
  }
}

/**
 * Guarda cabecera y renglones.
 *
 * Los renglones se reemplazan enteros: un pedido editado puede tener menos
 * articulos que antes, y un upsert dejaria vivos los que se quitaron.
 */
function guardarPedido(pedido) {
  if (!pedido || !pedido.id) throw new Error('El pedido no trae id');

  const candado = LockService.getScriptLock();
  candado.waitLock(20000);
  try {
    const t = pedido.totales || {};
    upsert(HOJA.pedidos, [
      {
        id: pedido.id,
        numero: pedido.numero,
        linea: pedido.linea,
        cliente_id: pedido.cliente_id || (pedido.cliente && pedido.cliente.id) || '',
        fecha: pedido.fecha,
        corte_id: pedido.corte_id || '',
        estado: pedido.estado,
        obs_generales: pedido.obsGenerales || '',
        bruto: t.bruto || 0,
        descuento: t.descuento || 0,
        subtotal: t.subtotal || 0,
        iva: t.iva || 0,
        icui: t.icui || 0,
        total: t.total || 0,
        updated_at: pedido.updatedAt || new Date().toISOString(),
      },
    ]);

    borrarDonde(HOJA.items, 'pedido_id', pedido.id);

    const items = pedido.items || [];
    if (items.length) {
      const filas = items.map(function (it, i) {
        return {
          id: pedido.id + '-' + (i + 1),
          pedido_id: pedido.id,
          /*
           * Los nombres vienen del dominio de la aplicacion, en camelCase.
           * Se aceptan tambien los de la hoja por si el renglon llega de una
           * lectura previa en vez de recien armado.
           */
          producto_id: it.id || it.producto_id || '',
          producto: it.producto,
          categoria: it.categoria,
          referencia_id: it.referenciaId || it.referencia_id || '',
          precio: it.precio,
          iva_pct: it.iva,
          icui_pct: it.icui || 0,
          embalaje: it.embalaje || 1,
          cantidad: it.cantidad,
          descuento_pct: it.descuentoPct,
          observaciones: it.observaciones || '',
        };
      });
      reemplazarAlFinal(HOJA.items, filas);
    }

    return { ok: true, id: pedido.id, numero: pedido.numero, items: items.length };
  } finally {
    candado.releaseLock();
  }
}

/** Agrega filas al final en una sola escritura. */
function reemplazarAlFinal(nombre, filas) {
  const h = hoja(nombre);
  const cols = cabecera(nombre);
  const valores = filas.map(function (f) {
    return aFila(f, cols);
  });
  h.getRange(h.getLastRow() + 1, 1, valores.length, cols.length).setValues(valores);
}

/**
 * Borra un cliente de la hoja.
 *
 * Solo para clientes sin pedidos. Los que ya facturaron se desactivan en vez
 * de borrarse (activo = NO): sus pedidos guardan el `cliente_id` y necesitan
 * la fila para poder reimprimirse con nombre y direccion.
 */
function eliminarCliente(id) {
  if (!id) throw new Error('Falta el id');

  const candado = LockService.getScriptLock();
  candado.waitLock(20000);
  try {
    const conPedidos = leer(HOJA.pedidos).some(function (p) {
      return String(p.cliente_id).trim() === String(id).trim();
    });
    if (conPedidos) {
      throw new Error('El cliente tiene pedidos: desactivelo en vez de borrarlo');
    }
    return { ok: true, clientes: borrarDonde(HOJA.clientes, 'id', id) };
  } finally {
    candado.releaseLock();
  }
}

function eliminarPedido(id) {
  return eliminarPedidos([id]);
}

/**
 * Borra varios pedidos de una sola pasada.
 *
 * Borrarlos de a uno recorria las dos pestañas por cada pedido. Aca se recorre
 * una vez cada una, sin importar cuantos sean.
 */
function eliminarPedidos(ids) {
  const lista = (ids || []).filter(function (x) {
    return !!x;
  });
  if (!lista.length) throw new Error('No se indico ningun pedido');

  const candado = LockService.getScriptLock();
  candado.waitLock(30000);
  try {
    const items = borrarDondeAlguno(HOJA.items, 'pedido_id', lista);
    const cab = borrarDondeAlguno(HOJA.pedidos, 'id', lista);
    return { ok: true, pedidos: cab, items: items };
  } finally {
    candado.releaseLock();
  }
}

/**
 * Vista del Informe ya calculada por la aplicacion.
 *
 * Es una vista materializada: existe para que al abrir la hoja se vean las
 * cifras en el formato de siempre. Se reescribe completa en cada corte, asi
 * que lo que se edite a mano aqui se pierde.
 */
function guardarInforme(corteId, filas) {
  if (!corteId) throw new Error('Falta el corte');

  const candado = LockService.getScriptLock();
  candado.waitLock(20000);
  try {
    borrarDonde(HOJA.informe, 'corte_id', corteId);
    // Tambien las filas sin corte: son la plantilla que quedo de la migracion
    // y ensucian la hoja porque ningun corte las reclama.
    borrarDonde(HOJA.informe, 'corte_id', '');

    if (filas && filas.length) {
      const conCorte = filas.map(function (f) {
        f.corte_id = corteId;
        return f;
      });
      reemplazarAlFinal(HOJA.informe, conCorte);
    }

    ordenarInforme();
    return { ok: true, corte_id: corteId, filas: (filas || []).length };
  } finally {
    candado.releaseLock();
  }
}

/**
 * Deja la pestaña del Informe en orden cronologico.
 *
 * Las filas se agregan al final, asi que sin esto la hoja queda en orden de
 * escritura: si se recalcula la semana 4 antes que la 1, aparecen al reves.
 */
function ordenarInforme() {
  const h = hoja(HOJA.informe);
  const cols = cabecera(HOJA.informe);
  if (h.getLastRow() < 3) return;

  const col = function (nombre) {
    return cols.indexOf(nombre) + 1;
  };

  h.getRange(2, 1, h.getLastRow() - 1, cols.length).sort([
    { column: col('corte_id'), ascending: true },
    { column: col('orden'), ascending: true },
  ]);
}

// ==========================================================================
// Prueba manual
// ==========================================================================

/**
 * Correr desde el editor (boton Ejecutar) para verificar que las pestañas
 * estan completas y se leen bien, antes de publicar.
 */
function probar() {
  const c = catalogos();
  const p = planeacion();
  Logger.log('parametros   : %s', c.parametros.length);
  Logger.log('referencias  : %s', c.referencias.length);
  Logger.log('ciudades     : %s', c.ciudades.length);
  Logger.log('productos    : %s Condimar, %s Nidalca',
    c.productosCondimar.length, c.productosNidalca.length);
  Logger.log('clientes     : %s Condimar, %s Nidalca',
    c.clientesCondimar.length, c.clientesNidalca.length);
  Logger.log('cortes       : %s', p.cortes.length);
  Logger.log('presupuestos : %s', p.presupuestos.length);
  Logger.log('informe      : %s filas', leer(HOJA.informe).length);
  Logger.log('pedidos      : %s', pedidosConItems().length);
  Logger.log('siguiente numero Condimar: %s', siguienteNumero('CONDIMAR'));
}
