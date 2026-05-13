import supabase from '../config/supabase';
import { cargarDiagnosticoCompleto } from './diagnostico.service';
import { ItemCotizacion, CotizacionUpdate } from '../models/cotizacion.model';

const COTIZACION_LIST_SELECT = `
  *, diagnosticos(id, numero_diagnostico, tipo_mantencion, status),
  actas(id, numero_acta), clientes(id, nombre, telefono, email),
  vehiculos(id, marca, modelo, patente, anio)
`;

const STATUS_COTIZACION = new Set(['borrador', 'lista', 'enviada', 'aprobada', 'rechazada']);
const STATUS_DIAGNOSTICO = new Set(['pendiente', 'proceso', 'listo', 'cerrado']);

/** `status` en query suele ser de cotización; si mandan `listo`/`proceso`/… es del diagnóstico, no de la tabla cotizaciones. */
function resolverFiltrosBusquedaCotizacion(opts: { status?: string; diagnostico_status?: string }) {
  let statusCotizacion: string | undefined;
  let statusDiagnostico: string | undefined;

  const diagParam = opts.diagnostico_status?.trim().toLowerCase();
  if (diagParam) statusDiagnostico = diagParam;

  const st = opts.status?.trim().toLowerCase();
  if (st) {
    if (STATUS_COTIZACION.has(st)) statusCotizacion = st;
    else if (STATUS_DIAGNOSTICO.has(st)) {
      if (!statusDiagnostico) statusDiagnostico = st;
    } else {
      statusCotizacion = st;
    }
  }

  return { statusCotizacion, statusDiagnostico };
}

interface TotalesOverrides {
  margen_pct?: number;
  horas_trabajo?: number;
  costo_hora_tecnico?: number;
  descuento_tipo?: string;
}

export function calcularTotales(items: ItemCotizacion[] = [], descuento = 0, overrides: TotalesOverrides = {}) {
  const rows = items.filter(it => it.descripcion?.trim());
  const isMO = (it: ItemCotizacion) => String(it.tipo || '').toLowerCase().includes('mano');
  const margenPct = Number(overrides.margen_pct) > 0 ? Number(overrides.margen_pct) : 30;
  const horasTrabajo = Math.max(0, Number(overrides.horas_trabajo) || 0);
  const costoHoraTecnico = Math.max(0, Number(overrides.costo_hora_tecnico) || 0);

  const precioClienteNeto = (it: ItemCotizacion): number => {
    if (isMO(it)) return Number(it.precio_unitario || 0);
    const pu = Number(it.precio_unitario || 0);
    const cb = Number(it.costo_unitario || 0);
    if (pu > 0) return Math.round(pu / 1.19);
    if (cb > 0) return Math.round((cb / 1.19) / (1 - margenPct / 100));
    return 0;
  };

  const costoNetoSecco = (it: ItemCotizacion): number => {
    if (isMO(it)) return 0;
    const cb = Number(it.costo_unitario || 0);
    return cb > 0 ? Math.round(cb / 1.19) : 0;
  };

  const costoRepuestosNetos = rows.reduce((s, it) => s + Number(it.cantidad || 1) * costoNetoSecco(it), 0);
  const ventaRepuestos = rows.filter(it => !isMO(it)).reduce((s, it) => s + Number(it.cantidad || 1) * precioClienteNeto(it), 0);
  const ventaMo = rows.filter(it => isMO(it)).reduce((s, it) => s + Number(it.cantidad || 1) * precioClienteNeto(it), 0);
  const netoFinal = Math.max(0, ventaRepuestos + ventaMo);

  const costoMoReal = Math.round(horasTrabajo * costoHoraTecnico);
  const ivaDebito = Math.round(netoFinal * 0.19);
  const ivaCredito = Math.round(costoRepuestosNetos * 0.19);
  const subtotalCliente = Math.round(netoFinal + ivaDebito);
  const totalFinalSinDescuento = Math.round(subtotalCliente / 0.98);

  const descuentoCalculado = overrides.descuento_tipo === 'porcentaje'
    ? totalFinalSinDescuento * (Number(descuento || 0) / 100)
    : Number(descuento || 0);
  const descuentoMonto = Math.min(totalFinalSinDescuento, Math.max(0, descuentoCalculado));
  const totalFinalCliente = Math.max(0, Math.round(totalFinalSinDescuento - descuentoMonto));

  const utilidadRepuestos = Math.round(ventaRepuestos - costoRepuestosNetos);
  const utilidadMo = Math.round(ventaMo - costoMoReal);
  const utilidadTotal = Math.round(utilidadRepuestos + utilidadMo - descuentoMonto);
  const margen = netoFinal > 0 ? (utilidadTotal / netoFinal) * 100 : 0;

  return {
    costo_total: Math.round(costoRepuestosNetos * 1.19),
    mano_obra_total: Math.round(ventaMo),
    subtotal: Math.round(netoFinal),
    iva: Math.round(ivaDebito),
    iva_credito: ivaCredito,
    descuento: Math.round(descuentoMonto),
    total: subtotalCliente,
    total_final_cliente: totalFinalCliente,
    utilidad: utilidadTotal,
    margen: Number(margen.toFixed(2)),
  };
}

export async function cargarCotizacionCompleta(id: string) {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select(`*, diagnosticos(*, diagnostico_checklist(*), diagnostico_repuestos(*)), actas(*), clientes(*), vehiculos(*)`)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

/** Cotización borrador ligada al acta, sin diagnóstico (presupuesto «inicial»). */
export async function crearCotizacionInicialDesdeActa(actaId: string) {
  const { data: acta, error: errActa } = await supabase
    .from('actas')
    .select('id, numero_acta, cliente_id, vehiculo_id, trabajo_solicitado')
    .eq('id', actaId)
    .single();
  if (errActa || !acta) throw new Error('Acta no encontrada');

  const { data: existente } = await supabase
    .from('cotizaciones')
    .select('id')
    .eq('acta_id', actaId)
    .in('status', ['borrador', 'lista', 'enviada'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existente?.id) return cargarCotizacionCompleta(existente.id as string);

  const descRaw = String((acta as { trabajo_solicitado?: string }).trabajo_solicitado || '').trim();
  const desc = descRaw || 'Presupuesto inicial según acta';
  const items: ItemCotizacion[] = [
    {
      tipo: 'servicio',
      descripcion: desc.slice(0, 300),
      cantidad: 1,
      costo_unitario: 0,
      precio_unitario: 0,
      mano_obra: 0,
      urgencia: 'necesario',
    },
  ];
  const totales = calcularTotales(items, 0);
  const numActa = (acta as { numero_acta?: number | null }).numero_acta;

  const row: Record<string, unknown> = {
    acta_id: actaId,
    vehiculo_id: (acta as { vehiculo_id?: string | null }).vehiculo_id || null,
    cliente_id: (acta as { cliente_id?: string | null }).cliente_id || null,
    items,
    status: 'borrador',
    vista_cliente: {
      titulo: numActa != null ? `Presupuesto inicial · Acta #${numActa}` : 'Presupuesto inicial',
      resumen: descRaw,
      tipo_presupuesto: 'inicial',
      descuento_tipo: 'monto',
      descuento_valor: 0,
      horas_trabajo: 0,
      costo_hora_tecnico: 4900,
    },
    ...totales,
  };

  const { data, error } = await supabase.from('cotizaciones').insert(row).select().single();
  if (error) throw error;
  return cargarCotizacionCompleta((data as { id: string }).id);
}

/** Presupuesto borrador sin acta ni diagnóstico (desde listado / flujo libre). */
export async function crearCotizacionBorradorLibre() {
  const items: ItemCotizacion[] = [
    {
      tipo: 'servicio',
      descripcion: 'Descripción del trabajo o repuesto',
      cantidad: 1,
      costo_unitario: 0,
      precio_unitario: 0,
      mano_obra: 0,
      urgencia: 'necesario',
    },
  ];
  const totales = calcularTotales(items, 0);
  const row: Record<string, unknown> = {
    vehiculo_id: null,
    cliente_id: null,
    items,
    status: 'borrador',
    vista_cliente: {
      titulo: 'Nuevo presupuesto',
      resumen: '',
      tipo_presupuesto: 'final',
      descuento_tipo: 'monto',
      descuento_valor: 0,
      horas_trabajo: 0,
      costo_hora_tecnico: 4900,
    },
    ...totales,
  };
  const { data, error } = await supabase.from('cotizaciones').insert(row).select().single();
  if (error) throw error;
  return cargarCotizacionCompleta((data as { id: string }).id);
}

export async function crearCotizacionDesdeDiagnostico(diagnosticoId: string) {
  const { data: existente } = await supabase
    .from('cotizaciones')
    .select('*')
    .eq('diagnostico_id', diagnosticoId)
    .in('status', ['borrador', 'lista', 'enviada'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existente) return cargarCotizacionCompleta((existente as { id: string }).id);

  const diagnostico = await cargarDiagnosticoCompleto(diagnosticoId) as Record<string, unknown>;
  const acta = (diagnostico.actas || {}) as Record<string, unknown>;

  const repuestos = ((diagnostico.diagnostico_repuestos || []) as Record<string, unknown>[]).map(r => ({
    tipo: 'repuesto' as const,
    descripcion: String(r.nombre || ''),
    cantidad: Number(r.cantidad) || 1,
    costo_unitario: 0, precio_unitario: 0, mano_obra: 0,
    urgencia: (r.urgencia as 'necesario' | 'recomendado' | 'opcional') || 'recomendado',
    observacion: String(r.observacion || ''),
  }));

  const items: ItemCotizacion[] = [
    { tipo: 'servicio', descripcion: 'Mantención base: aceite, filtros y revisión general', cantidad: 1, costo_unitario: 0, precio_unitario: 0, mano_obra: 0, urgencia: 'necesario' },
    ...repuestos,
  ];

  const totales = calcularTotales(items, 0);

  const { data, error } = await supabase
    .from('cotizaciones')
    .insert({
      diagnostico_id: diagnostico.id, acta_id: diagnostico.acta_id,
      vehiculo_id: acta.vehiculo_id || null, cliente_id: acta.cliente_id || null,
      items, status: 'borrador',
      vista_cliente: {
        titulo: `Propuesta de mantención ${diagnostico.tipo_mantencion || ''}`.trim(),
        resumen: acta.trabajo_solicitado || '',
        tipo_presupuesto: 'final', descuento_tipo: 'monto',
        descuento_valor: 0, horas_trabajo: Number(diagnostico.horas_estimadas || 0),
        costo_hora_tecnico: 4900,
      },
      ...totales,
    })
    .select()
    .single();

  if (error) throw error;
  return cargarCotizacionCompleta((data as { id: string }).id);
}

export async function actualizarCotizacion(id: string, datos: CotizacionUpdate) {
  const payload: Record<string, unknown> = { ...datos, updated_at: new Date().toISOString() };
  if (datos.items && datos.vista_cliente) {
    const totales = calcularTotales(datos.items, datos.descuento || 0, datos.vista_cliente as TotalesOverrides);
    Object.assign(payload, totales);
  }
  const { data, error } = await supabase.from('cotizaciones').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function eliminarCotizacion(id: string) {
  const { data, error } = await supabase
    .from('cotizaciones')
    .delete()
    .eq('id', id)
    .select('id')
    .single();

  if (error) throw error;
  return data;
}

export async function listarCotizaciones(limite = 30) {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select(COTIZACION_LIST_SELECT)
    .order('updated_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}

/** Listado por patente (parcial): vehículo, acta o diagnóstico de esas actas. Query: limite, status (cotización o diagnóstico), diagnostico_status. */
export async function buscarCotizacionesPorPatente(
  patente: string,
  opts: { limite?: number; status?: string; diagnostico_status?: string } = {},
) {
  const q = patente.trim();
  if (!q) return [];

  const limite = opts.limite ?? 30;
  const safe = q.replace(/[%_\\]/g, '');
  if (!safe) return [];

  const { statusCotizacion, statusDiagnostico } = resolverFiltrosBusquedaCotizacion(opts);

  const pattern = `%${safe}%`;

  const { data: vehiculos, error: errV } = await supabase
    .from('vehiculos')
    .select('id')
    .ilike('patente', pattern);
  if (errV) throw errV;
  if (!vehiculos?.length) return [];

  const vids = (vehiculos as { id: string }[]).map((v) => v.id);

  const { data: actas, error: errA } = await supabase
    .from('actas')
    .select('id')
    .in('vehiculo_id', vids);
  if (errA) throw errA;
  const actaIds = ((actas || []) as { id: string }[]).map((a) => a.id);

  let qPorVeh = supabase
    .from('cotizaciones')
    .select(COTIZACION_LIST_SELECT)
    .in('vehiculo_id', vids);
  if (statusCotizacion) qPorVeh = qPorVeh.eq('status', statusCotizacion);

  const { data: porVehiculo, error: e1 } = await qPorVeh;
  if (e1) throw e1;

  let porActa: unknown[] = [];
  let porDiag: unknown[] = [];
  if (actaIds.length) {
    let qPorActa = supabase
      .from('cotizaciones')
      .select(COTIZACION_LIST_SELECT)
      .in('acta_id', actaIds);
    if (statusCotizacion) qPorActa = qPorActa.eq('status', statusCotizacion);
    const { data, error: e2 } = await qPorActa;
    if (e2) throw e2;
    porActa = data || [];

    const { data: diagnosticos, error: errD } = await supabase
      .from('diagnosticos')
      .select('id')
      .in('acta_id', actaIds);
    if (errD) throw errD;
    const diagIds = ((diagnosticos || []) as { id: string }[]).map((d) => d.id);
    if (diagIds.length) {
      let qPorDiag = supabase
        .from('cotizaciones')
        .select(COTIZACION_LIST_SELECT)
        .in('diagnostico_id', diagIds);
      if (statusCotizacion) qPorDiag = qPorDiag.eq('status', statusCotizacion);
      const { data: d3, error: e3 } = await qPorDiag;
      if (e3) throw e3;
      porDiag = d3 || [];
    }
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const row of [...(porVehiculo || []), ...porActa, ...porDiag]) {
    const rec = row as { id: string };
    if (rec?.id && !byId.has(rec.id)) byId.set(rec.id, row as Record<string, unknown>);
  }

  let merged = [...byId.values()].sort((a, b) => {
    const ta = new Date(String(a.updated_at ?? 0)).getTime();
    const tb = new Date(String(b.updated_at ?? 0)).getTime();
    return tb - ta;
  });

  if (statusDiagnostico) {
    const want = statusDiagnostico.toLowerCase();
    merged = merged.filter((row) => {
      const d = row.diagnosticos as { status?: string } | null | undefined;
      if (!d || typeof d !== 'object') return false;
      return String(d.status ?? '').toLowerCase() === want;
    });
  }

  return merged.slice(0, limite);
}
