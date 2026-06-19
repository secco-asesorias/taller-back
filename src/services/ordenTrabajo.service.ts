import supabase from '../config/supabase';
import { cargarCotizacionCompleta } from './cotizacion.service';
import { OTUpdate } from '../models/ordenTrabajo.model';
import { resolverTecnicoPorPerfilId } from './tecnico.service';
import { crearCompraDesdeCotizacion } from './compra.service';

const OT_SELECT = `
  id, numero_ot, status, tecnico_nombre, tecnico_id, created_at, updated_at,
  observaciones, notas_torre, km_ingreso, inicio_servicio, termino_servicio,
  instrucciones, pausas,
  vehiculos:vehiculo_id (marca, modelo, patente),
  clientes:cliente_id (nombre, telefono)
`;

interface OTItem { descripcion?: string; tipo?: string; id?: string; cantidad?: number; precio_unitario?: number; }

function otItemId(prefix: string, index: number, text = ''): string {
  const slug = String(text || '').toLowerCase().normalize('NFD')
    .replace(/\p{Mn}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 22);
  return `${prefix}-${index + 1}${slug ? `-${slug}` : ''}`;
}

export function estructurarOTDesdeItems(items: OTItem[] = []) {
  const rows = items.filter(it => String(it.descripcion || '').trim());
  const esManoObra = (it: OTItem) => String(it.tipo || '').toLowerCase().includes('mano');
  const esRepuesto = (it: OTItem) => String(it.tipo || '').toLowerCase().includes('repuesto');

  const repuestos = rows.filter(it => esRepuesto(it)).map((it, i) => ({
    id: it.id || otItemId('rep', i, it.descripcion),
    nombre: it.descripcion || '',
    cantidad: Number(it.cantidad || 1),
    precio: Number(it.precio_unitario || 0),
    origen: 'presupuesto',
  }));

  const instrucciones = rows.filter(it => !esRepuesto(it) && !esManoObra(it)).map((it, i) => ({
    id: it.id || otItemId('ins', i, it.descripcion),
    texto: it.descripcion || '',
    horas: undefined as number | undefined,
    repuestos_ids: [] as string[],
    orden: i + 1,
    completada: false,
  }));

  if (!instrucciones.length && repuestos.length) {
    instrucciones.push({
      id: 'ins-1-revision-general',
      texto: 'Ejecutar trabajos aprobados según presupuesto.',
      horas: undefined,
      repuestos_ids: repuestos.map(r => r.id),
      orden: 1,
      completada: false,
    });
  }

  return { repuestos, instrucciones };
}

/** Normaliza patente para comparar (trim + uppercase + sin espacios/guiones). */
function normalizarPatente(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().toUpperCase().replace(/[\s-]/g, '');
}

function patenteDeCotizacion(cot: Record<string, unknown>): string {
  const vc = (cot.vista_cliente as Record<string, unknown> | null) || {};
  const veh = (vc.vehiculo_manual as Record<string, unknown> | null) || {};
  return normalizarPatente(veh.patente);
}

function cotizacionTieneRepuestos(cot: Record<string, unknown>): boolean {
  const items = (cot.items as OTItem[] | null) || [];
  return items.some(it => String(it.tipo || '').toLowerCase().includes('repuesto') && String(it.descripcion || '').trim());
}

/**
 * Fallback: cuando el presupuesto no está vinculado al acta por `acta_id` ni vía diagnóstico,
 * buscar el más reciente cuya patente manual (`vista_cliente.vehiculo_manual.patente`) coincida
 * con la del vehículo del acta. Prioriza los que tienen repuestos. Los presupuestos casi nunca
 * tienen `vehiculo_id`, por eso se matchea por patente.
 */
async function buscarCotizacionPorPatente(patente: string): Promise<Record<string, unknown> | null> {
  const objetivo = normalizarPatente(patente);
  if (!objetivo) return null;

  const { data: candidatas } = await supabase
    .from('cotizaciones')
    .select('*')
    .not('status', 'eq', 'rechazada')
    .order('updated_at', { ascending: false })
    .limit(80);

  const rows = ((candidatas || []) as Record<string, unknown>[])
    .filter(c => patenteDeCotizacion(c) === objetivo);
  if (!rows.length) return null;

  // Preferir la primera (más reciente) que tenga repuestos; si ninguna, la más reciente.
  return rows.find(cotizacionTieneRepuestos) || rows[0];
}

/** Una OT está "vacía" si no tiene ningún repuesto con nombre no vacío. */
function repuestosVacios(repuestos: unknown): boolean {
  const arr = Array.isArray(repuestos) ? repuestos as Record<string, unknown>[] : [];
  return !arr.some(r => String(r?.nombre || '').trim());
}

/** Nota de historial al asociar un presupuesto (marca si fue por patente). */
function notaCotizacion(cot: Record<string, unknown>, origen: string | null): string {
  return `COT-${cot.numero_cotizacion}${origen === 'patente' ? ' (asociado por patente)' : ''}`;
}

/**
 * Busca el presupuesto asociado a un acta, en orden de prioridad:
 * acta_id directo → vía diagnóstico → fallback por patente del vehículo del acta.
 * El acta debe venir con `vehiculos` poblado (para el fallback por patente).
 */
async function buscarCotizacionParaActa(
  actaId: string,
  acta: Record<string, unknown>,
): Promise<{ cot: Record<string, unknown> | null; origen: 'acta' | 'diagnostico' | 'patente' | null }> {
  const { data: cotDirecta } = await supabase
    .from('cotizaciones')
    .select('*')
    .eq('acta_id', actaId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cotDirecta) return { cot: cotDirecta as Record<string, unknown>, origen: 'acta' };

  const { data: diags } = await supabase
    .from('diagnosticos')
    .select('id')
    .eq('acta_id', actaId);
  const diagIds = ((diags || []) as { id: string }[]).map(d => d.id);
  if (diagIds.length) {
    const { data: cotViaDiag } = await supabase
      .from('cotizaciones')
      .select('*')
      .in('diagnostico_id', diagIds)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cotViaDiag) return { cot: cotViaDiag as Record<string, unknown>, origen: 'diagnostico' };
  }

  // Fallback por patente (los presupuestos no suelen tener vehiculo_id).
  const veh = acta.vehiculos as Record<string, unknown> | null;
  const cotPorPatente = await buscarCotizacionPorPatente((veh?.patente as string | undefined) ?? '');
  if (cotPorPatente) return { cot: cotPorPatente, origen: 'patente' };

  return { cot: null, origen: null };
}

export async function crearOTDesdeActa(actaId: string) {
  // 1. Obtener el acta (con vehículo/cliente, necesarios para datos de la OT y el fallback)
  const { data: acta, error: errActa } = await supabase
    .from('actas')
    .select('*, vehiculos:vehiculo_id(*), clientes:cliente_id(*)')
    .eq('id', actaId)
    .single();
  if (errActa) throw errActa;
  const actaRow = acta as Record<string, unknown>;

  // 2. ¿Ya existe OT para esta acta? (robusto ante duplicados: tomar la más antigua)
  const { data: existentes } = await supabase
    .from('ordenes_trabajo')
    .select('id, numero_ot, status, repuestos')
    .eq('acta_id', actaId)
    .order('created_at', { ascending: true });
  const existente = ((existentes || []) as Record<string, unknown>[])[0] || null;

  if (existente) {
    const vaciaYTemprana = existente.status === 'generada' && repuestosVacios(existente.repuestos);
    // Si ya tiene repuestos o avanzó de estado, no la tocamos (no pisar trabajo del TC).
    if (!vaciaYTemprana) return existente;

    // OT vacía: intentar repoblarla con el presupuesto ahora disponible.
    const { cot, origen } = await buscarCotizacionParaActa(actaId, actaRow);
    if (!cot) return existente; // sigue sin presupuesto vinculado

    const { repuestos, instrucciones } = estructurarOTDesdeItems((cot.items as OTItem[]) ?? []);
    const { data: histRow } = await supabase
      .from('ordenes_trabajo').select('historial').eq('id', existente.id as string).single();
    const historial = ((histRow as { historial?: unknown[] } | null)?.historial) || [];

    const { data: actualizada, error: errUpd } = await supabase
      .from('ordenes_trabajo')
      .update({
        cotizacion_id: cot.id,
        repuestos,
        instrucciones,
        items:         cot.items ?? [],
        updated_at:    new Date().toISOString(),
        historial: [...historial, {
          ts:     new Date().toISOString(),
          accion: 'Repuestos cargados desde presupuesto',
          nota:   notaCotizacion(cot, origen),
        }],
      })
      .eq('id', existente.id as string)
      .select()
      .single();
    if (errUpd) throw errUpd;
    return actualizada;
  }

  // 3. No existe OT → buscar presupuesto y crear una nueva (numero_ot por SERIAL)
  const { cot, origen } = await buscarCotizacionParaActa(actaId, actaRow);
  const { repuestos, instrucciones } = cot
    ? estructurarOTDesdeItems((cot.items as OTItem[]) ?? [])
    : { repuestos: [], instrucciones: [] };

  const { data: ot, error: errOT } = await supabase
    .from('ordenes_trabajo')
    .insert({
      acta_id:       actaId,
      cotizacion_id: cot?.id ?? null,
      vehiculo_id:   actaRow.vehiculo_id ?? null,
      cliente_id:    actaRow.cliente_id ?? null,
      km_ingreso:    actaRow.km ?? null,
      status:        'generada',
      repuestos,
      instrucciones,
      items:         cot?.items ?? [],
      observaciones: '',
      notas_torre:   '',
      historial: [{
        ts:     new Date().toISOString(),
        accion: 'OT generada desde acta',
        nota:   cot ? notaCotizacion(cot, origen) : 'sin cotización',
      }],
    })
    .select()
    .single();
  if (errOT) throw errOT;

  return ot;
}

export async function aprobarCotizacionYCrearOT(cotizacionId: string) {
  const cot = await cargarCotizacionCompleta(cotizacionId) as Record<string, unknown>;
  const estructuraOT = estructurarOTDesdeItems((cot.items || []) as OTItem[]);

  const { error: errCot } = await supabase
    .from('cotizaciones')
    .update({ status: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', cotizacionId);
  if (errCot) throw errCot;

  // Generar la compra de repuestos para el encargado de comprar (idempotente; corre en todos los caminos).
  await crearCompraDesdeCotizacion(cot);

  // Dedup 1: si ya existe una OT para este presupuesto, devolverla (idempotente ante doble aprobación).
  const { data: otPorCot } = await supabase
    .from('ordenes_trabajo')
    .select('id')
    .eq('cotizacion_id', cotizacionId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (otPorCot) return cargarOTCompleta((otPorCot as { id: string }).id);

  // Dedup 2: si la misma acta ya tiene una OT (p. ej. creada antes desde el acta), no duplicar.
  //          Si está vacía, completarla con los repuestos del presupuesto.
  if (cot.acta_id) {
    const { data: otsActa } = await supabase
      .from('ordenes_trabajo')
      .select('id, status, repuestos')
      .eq('acta_id', cot.acta_id as string)
      .order('created_at', { ascending: true });
    const otActa = ((otsActa || []) as Record<string, unknown>[])[0];
    if (otActa) {
      if (otActa.status === 'generada' && repuestosVacios(otActa.repuestos)) {
        const { data: histRow } = await supabase
          .from('ordenes_trabajo').select('historial').eq('id', otActa.id as string).single();
        const historial = ((histRow as { historial?: unknown[] } | null)?.historial) || [];
        await supabase.from('ordenes_trabajo').update({
          cotizacion_id: cotizacionId,
          repuestos:     estructuraOT.repuestos,
          instrucciones: estructuraOT.instrucciones,
          items:         cot.items || [],
          updated_at:    new Date().toISOString(),
          historial: [...historial, {
            ts:     new Date().toISOString(),
            accion: 'Repuestos cargados desde presupuesto aprobado',
            nota:   `COT-${cot.numero_cotizacion}`,
          }],
        }).eq('id', otActa.id as string);
      }
      return cargarOTCompleta(otActa.id as string);
    }
  }

  // No hay OT previa → crear una nueva.
  // El vehículo/cliente casi nunca están en la cotización (van manuales); se toman del acta vinculada.
  const acta = (cot.actas ?? {}) as Record<string, unknown>;
  const { data: ot, error: errOT } = await supabase
    .from('ordenes_trabajo')
    .insert({
      cotizacion_id:  cotizacionId,
      acta_id:        cot.acta_id || acta.id || null,
      vehiculo_id:    cot.vehiculo_id || acta.vehiculo_id || null,
      cliente_id:     cot.cliente_id || acta.cliente_id || null,
      km_ingreso:     acta.km ?? null,
      status:         'generada',
      items:          cot.items || [],
      repuestos:      estructuraOT.repuestos,
      instrucciones:  estructuraOT.instrucciones,
      observaciones:  cot.notas || '',
      notas_torre:    '',
      historial: [{ ts: new Date().toISOString(), accion: 'OT generada desde cotización', nota: `COT-${cot.numero_cotizacion}` }],
    })
    .select()
    .single();
  if (errOT) throw errOT;

  return cargarOTCompleta((ot as { id: string }).id);
}

export async function cargarOTCompleta(id: string) {
  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .select(`*, cotizaciones!cotizacion_id(*, diagnosticos(*, actas(*, vehiculos(*), clientes(*)))), vehiculos!vehiculo_id(*), clientes!cliente_id(*), actas!acta_id(*, vehiculos(*), clientes(*))`)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function listarOTs(limite = 30, status?: string, tecnicoId?: string) {
  let query = supabase
    .from('ordenes_trabajo')
    .select(OT_SELECT)
    .order('updated_at', { ascending: false })
    .limit(limite);

  if (status)    query = query.eq('status', status);
  if (tecnicoId) query = query.eq('tecnico_id', tecnicoId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function asignarTecnicoOT(otId: string, tecnicoId: string) {
  const tecnico = await resolverTecnicoPorPerfilId(tecnicoId);
  return actualizarOT(otId, {
    status: 'asignada',
    tecnico_id: tecnico.id,
    tecnico_nombre: tecnico.nombre,
    nota_historial: `Asignado a técnico: ${tecnico.nombre}`,
  });
}

export async function actualizarOT(id: string, datos: OTUpdate) {
  const historialEntry = datos.status || datos.nota_historial
    ? { ts: new Date().toISOString(), accion: datos.status ? `Estado cambiado a: ${datos.status}` : 'Actualización', nota: datos.nota_historial || '' }
    : null;

  const { data: otActual } = await supabase
    .from('ordenes_trabajo').select('historial').eq('id', id).single();
  const historialActual = ((otActual as { historial?: unknown[] } | null)?.historial) || [];

  const { nota_historial: _, ...payload } = datos;
  const updatePayload: Record<string, unknown> = {
    ...payload,
    updated_at: new Date().toISOString(),
    ...(historialEntry ? { historial: [...historialActual, historialEntry] } : {}),
  };

  const { data, error } = await supabase
    .from('ordenes_trabajo').update(updatePayload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
