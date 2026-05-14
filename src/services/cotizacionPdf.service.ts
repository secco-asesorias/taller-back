import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== '') return String(v);
  }
  return '';
}

function n(x: unknown): number {
  return Math.round(Number(x) || 0);
}

function parseMontoInput(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let s = String(value).trim().replace(/\s/g, '');
  if (!s) return 0;
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, '')) || 0;
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) {
    return Number(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  s = s.replace(',', '.');
  return Number(s) || 0;
}

function formatEnteroCl(value: unknown): string {
  const num = Math.round(parseMontoInput(value));
  const neg = num < 0;
  const abs = Math.abs(num);
  const parts = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return neg ? `-${parts}` : parts;
}

export interface PresupuestoPdfItem {
  index: string;
  descripcion: string;
  detalle: string;
  cantidad: string;
  total: string;
}

export interface PresupuestoPdfContext {
  fecha: string;
  cotizacionNumero: string;
  diasValidez: string;
  cliente: { nombre: string; telefono: string; correo: string };
  vehiculo: {
    patente: string;
    marca: string;
    modelo: string;
    anio: string;
    kilometraje: string;
    vin: string;
  };
  /** Líneas que no son mano de obra (repuesto, servicio, trabajo, etc.). */
  itemsRepuestos: PresupuestoPdfItem[];
  /** Líneas de mano de obra (`tipo` que incluye «mano»). */
  itemsManoObra: PresupuestoPdfItem[];
  resumen: {
    neto: string;
    iva: string;
    subtotal: string;
    cargoServicio: string;
    descuento: string;
    total: string;
  };
  /** Data URL del logo; lo inyecta el backend al generar el PDF. */
  logoSrc?: string;
}

function formatFechaEs(iso: unknown): string {
  if (iso == null || iso === '') return '';
  const s = String(iso);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return s;
}

function isManoObraItem(it: Record<string, unknown>): boolean {
  const tipo = String(it.tipo || '').toLowerCase();
  return tipo.includes('mano') || tipo === 'mano_obra';
}

interface PdfLineRow {
  mo: boolean;
  descripcion: string;
  detalle: string;
  cantidad: string;
  total: string;
}

function pdfLineFromDb(it: Record<string, unknown>): PdfLineRow {
  const cant = Number(it.cantidad) || 1;
  const pu = Number(it.precio_unitario) || 0;
  const line = Math.round(cant * pu);
  return {
    mo: isManoObraItem(it),
    descripcion: String(it.descripcion ?? ''),
    detalle: String(it.tipo ?? it.observacion ?? ''),
    cantidad: formatEnteroCl(cant),
    total: formatEnteroCl(line),
  };
}

function withIndex(rows: PdfLineRow[]): PresupuestoPdfItem[] {
  return rows.map((row, i) => ({
    index: String(i + 1),
    descripcion: row.descripcion,
    detalle: row.detalle,
    cantidad: row.cantidad,
    total: row.total,
  }));
}

function splitPdfLines(lines: PdfLineRow[]): {
  itemsRepuestos: PresupuestoPdfItem[];
  itemsManoObra: PresupuestoPdfItem[];
} {
  const rep = lines.filter((l) => !l.mo);
  const mo = lines.filter((l) => l.mo);
  return {
    itemsRepuestos: withIndex(rep),
    itemsManoObra: withIndex(mo),
  };
}

function cotizacionLikeRecord(r: Record<string, unknown>): boolean {
  return (
    r.tipo != null ||
    r.type != null ||
    r.precio_unitario != null ||
    r.precioUnitario != null
  );
}

function pdfLineFromBodyRecord(r: Record<string, unknown>): PdfLineRow {
  if (cotizacionLikeRecord(r)) {
    const merged: Record<string, unknown> = {
      ...r,
      tipo: r.tipo ?? r.type,
      precio_unitario: r.precio_unitario ?? r.precioUnitario,
      cantidad: r.cantidad ?? r.quantity,
      descripcion: r.descripcion ?? r.description,
      observacion: r.observacion,
    };
    return pdfLineFromDb(merged);
  }
  const rep = Number(r.repuesto) || 0;
  const mob = Number(r.manoObra ?? r.mano_obra) || 0;
  const totalRaw = pickStr(r.total, String(Math.max(rep + mob, 0)));
  const mo = mob > 0 && rep === 0;
  return {
    mo,
    descripcion: pickStr(r.descripcion),
    detalle: pickStr(r.detalle),
    cantidad: formatEnteroCl(parseMontoInput(pickStr(r.cantidad, '1'))),
    total: formatEnteroCl(parseMontoInput(totalRaw)),
  };
}

function presupuestoContextFromRow(row: Record<string, unknown>): PresupuestoPdfContext {
  const clienteDb = asRecord(row.clientes);
  const vehDb = asRecord(row.vehiculos);
  const acta = asRecord(row.actas);
  const numActa = acta?.numero_acta;
  const cotNum = numActa != null ? String(numActa) : String(row.id ?? '').slice(0, 8);

  const itemsRaw = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];
  const lines = itemsRaw.map((it) => pdfLineFromDb(it));
  const { itemsRepuestos, itemsManoObra } = splitPdfLines(lines);

  const neto = n(row.subtotal);
  const iva = n(row.iva);
  const subtotalConIva = n(row.total);
  const desc = n(row.descuento);
  const totalFinal = n(row.total_final_cliente) || subtotalConIva;
  const cargoServicio = Math.max(0, totalFinal - subtotalConIva + desc);

  return {
    fecha: formatFechaEs(row.updated_at ?? row.created_at),
    cotizacionNumero: cotNum,
    diasValidez: '7',
    cliente: {
      nombre: pickStr(clienteDb?.nombre, '—'),
      telefono: pickStr(clienteDb?.telefono),
      correo: pickStr(clienteDb?.correo, clienteDb?.email),
    },
    vehiculo: {
      patente: pickStr(vehDb?.patente, '—'),
      marca: pickStr(vehDb?.marca),
      modelo: pickStr(vehDb?.modelo),
      anio: pickStr(vehDb?.anio),
      kilometraje: pickStr(vehDb?.kilometraje, acta?.kilometraje),
      vin: pickStr(vehDb?.vin, vehDb?.chasis),
    },
    itemsRepuestos,
    itemsManoObra,
    resumen: {
      neto: formatEnteroCl(neto),
      iva: formatEnteroCl(iva),
      subtotal: formatEnteroCl(subtotalConIva),
      cargoServicio: formatEnteroCl(cargoServicio),
      descuento: formatEnteroCl(desc),
      total: formatEnteroCl(totalFinal),
    },
  };
}

/** Combina el JSON del POST (como lo arma el front) con valores derivados de la fila en BD si faltan campos. */
export function mergePresupuestoFromBodyAndRow(
  body: Record<string, unknown>,
  row: Record<string, unknown>,
): PresupuestoPdfContext {
  const base = presupuestoContextFromRow(row);
  if (!body || Object.keys(body).length === 0) return base;

  const cBody = asRecord(body.cliente);
  const cliente = {
    nombre: pickStr(cBody?.nombre, body.nombre, base.cliente.nombre) || '—',
    telefono: pickStr(cBody?.telefono, body.telefono, base.cliente.telefono),
    correo: pickStr(cBody?.correo, cBody?.email, body.correo, base.cliente.correo),
  };

  const vBody = asRecord(body.vehiculo);
  const vehiculo = {
    patente: pickStr(vBody?.patente, base.vehiculo.patente) || '—',
    marca: pickStr(vBody?.marca, base.vehiculo.marca),
    modelo: pickStr(vBody?.modelo, base.vehiculo.modelo),
    anio: pickStr(vBody?.anio, base.vehiculo.anio),
    kilometraje: pickStr(vBody?.kilometraje, base.vehiculo.kilometraje),
    vin: pickStr(vBody?.vin, base.vehiculo.vin),
  };

  const rBody = asRecord(body.resumen);
  const resumen = {
    neto: formatEnteroCl(parseMontoInput(pickStr(rBody?.neto, base.resumen.neto))),
    iva: formatEnteroCl(parseMontoInput(pickStr(rBody?.iva, base.resumen.iva))),
    subtotal: formatEnteroCl(parseMontoInput(pickStr(rBody?.subtotal, base.resumen.subtotal))),
    cargoServicio: formatEnteroCl(
      parseMontoInput(pickStr(rBody?.cargoServicio, base.resumen.cargoServicio)),
    ),
    descuento: formatEnteroCl(parseMontoInput(pickStr(rBody?.descuento, base.resumen.descuento))),
    total: formatEnteroCl(parseMontoInput(pickStr(rBody?.total, base.resumen.total))),
  };

  let itemsRepuestos = base.itemsRepuestos;
  let itemsManoObra = base.itemsManoObra;
  if (Array.isArray(body.items) && body.items.length > 0) {
    const lines = (body.items as unknown[]).map((it) => pdfLineFromBodyRecord(asRecord(it) ?? {}));
    ({ itemsRepuestos, itemsManoObra } = splitPdfLines(lines));
  }

  return {
    fecha: pickStr(body.fecha, base.fecha),
    cotizacionNumero: pickStr(body.cotizacionNumero, base.cotizacionNumero),
    diasValidez: pickStr(body.diasValidez, base.diasValidez),
    cliente,
    vehiculo,
    itemsRepuestos,
    itemsManoObra,
    resumen,
  };
}

function readPresupuestosTemplate(): string {
  const candidates = [
    path.join(__dirname, '../templates/presupuestos.html'),
    path.join(process.cwd(), 'src/templates/presupuestos.html'),
    path.join(process.cwd(), 'dist/templates/presupuestos.html'),
  ];
  for (const pth of candidates) {
    if (!fs.existsSync(pth)) continue;
    const s = fs.readFileSync(pth, 'utf8');
    if (s.trim().length > 100) return s;
  }
  throw new Error(
    'No se encontró presupuestos.html con contenido (src/templates o dist/templates). Guarda el archivo en disco.',
  );
}

/** Logo PNG junto a la plantilla; se embebe como data URL para Puppeteer. */
function readLogoDataUrl(): string | undefined {
  const dirs = [
    path.join(__dirname, '../templates'),
    path.join(process.cwd(), 'src/templates'),
    path.join(process.cwd(), 'dist/templates'),
  ];
  for (const dir of dirs) {
    const pth = path.join(dir, 'logo-secco.png');
    if (!fs.existsSync(pth)) continue;
    const buf = fs.readFileSync(pth);
    if (buf.length < 32) continue;
    return `data:image/png;base64,${buf.toString('base64')}`;
  }
  return undefined;
}

let compiledPresupuesto: { source: string; render: ReturnType<typeof Handlebars.compile> } | null = null;

function getCompiledPresupuesto(): ReturnType<typeof Handlebars.compile> {
  const source = readPresupuestosTemplate();
  if (!compiledPresupuesto || compiledPresupuesto.source !== source) {
    compiledPresupuesto = { source, render: Handlebars.compile(source) };
  }
  return compiledPresupuesto.render;
}

function injectPdfRenderFixes(html: string): string {
  const fix = `<style data-pdf-fix>
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { min-height: 100%; }
    .document { overflow: visible !important; }
  </style>`;
  if (html.includes('</head>')) return html.replace('</head>', `${fix}</head>`);
  return `${fix}${html}`;
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 2000, deviceScaleFactor: 1 });
    const ready = injectPdfRenderFixes(html);
    await page.setContent(ready, { waitUntil: 'load', timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 150));
    await page.waitForSelector('.document', { timeout: 5000 }).catch(() => undefined);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function generarPdfPresupuesto(ctx: PresupuestoPdfContext): Promise<Buffer> {
  const logoSrc = readLogoDataUrl();
  const html = getCompiledPresupuesto()({
    ...ctx,
    ...(logoSrc ? { logoSrc } : {}),
  });
  if (html.trim().length < 200) {
    throw new Error('El HTML del presupuesto quedó vacío: revisa presupuestos.html en disco.');
  }
  return htmlToPdfBuffer(html);
}
