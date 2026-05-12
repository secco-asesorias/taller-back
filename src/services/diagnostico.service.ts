import supabase from '../config/supabase';
import { DiagnosticoUpdate, ChecklistItem, Repuesto } from '../models/diagnostico.model';

const DIAG_SELECT = `
  *,
  actas (
    id, numero_acta, fecha_ingreso, km, trabajo_solicitado, tecnico_nombre,
    clientes (id, nombre, telefono),
    vehiculos (id, marca, modelo, anio, patente, vin, color)
  )
`;

export async function crearDiagnostico(actaId: string, patente: string) {
  const { data: existente } = await supabase
    .from('diagnosticos')
    .select('*')
    .eq('acta_id', actaId)
    .in('status', ['pendiente', 'proceso'])
    .order('fecha_creacion', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existente) return existente;

  const { data, error } = await supabase
    .from('diagnosticos')
    .insert({ acta_id: actaId, nombre: `Diagnóstico - ${patente}`, status: 'pendiente' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listarDiagnosticos(limite = 30, status?: string) {
  let query = supabase
    .from('diagnosticos')
    .select(DIAG_SELECT)
    .order('fecha_creacion', { ascending: false })
    .limit(limite);

  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function cargarDiagnosticoCompleto(id: string) {
  const { data, error } = await supabase
    .from('diagnosticos')
    .select(`*, actas(*, clientes(*), vehiculos(*)), diagnostico_checklist(*), diagnostico_fotos(*), diagnostico_repuestos(*)`)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarDiagnostico(id: string, datos: DiagnosticoUpdate) {
  const payload: Record<string, unknown> = { ...datos };
  if (datos.status === 'proceso' && !datos.fecha_inicio) payload.fecha_inicio = new Date().toISOString();
  if (datos.status && ['listo', 'cerrado'].includes(datos.status) && !datos.fecha_cierre) {
    payload.fecha_cierre = new Date().toISOString();
  }
  const { data, error } = await supabase.from('diagnosticos').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function guardarChecklist(diagnosticoId: string, items: ChecklistItem[]) {
  if (!items?.length) return [];
  const rows = items.map(it => ({
    diagnostico_id: diagnosticoId, seccion: it.seccion, item: it.item,
    estado: it.estado || 'ok', observacion: it.observacion || null,
  }));
  const { data, error } = await supabase
    .from('diagnostico_checklist')
    .upsert(rows, { onConflict: 'diagnostico_id,seccion,item' })
    .select();
  if (error) throw error;
  return data || [];
}

export async function guardarRepuestos(diagnosticoId: string, repuestos: Repuesto[]) {
  const { error: delError } = await supabase
    .from('diagnostico_repuestos').delete().eq('diagnostico_id', diagnosticoId);
  if (delError) throw delError;
  if (!repuestos?.length) return [];

  const rows = repuestos.map(r => ({
    diagnostico_id: diagnosticoId, nombre: r.nombre, cantidad: r.cantidad || 1,
    es_base: !!r.es_base, urgencia: r.urgencia || 'recomendado', observacion: r.observacion || null,
  }));
  const { data, error } = await supabase.from('diagnostico_repuestos').insert(rows).select();
  if (error) throw error;
  return data || [];
}

export async function buscarDiagnosticoPorPatente(
  patente: string,
  opts: { limite?: number; status?: string; soloActivos?: boolean } = {},
) {
  const q = patente.trim();
  if (!q) return [];

  const limite = opts.limite ?? 30;
  const safe = q.replace(/[%_\\]/g, '');
  if (!safe) return [];

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
  if (!actaIds.length) return [];

  let query = supabase
    .from('diagnosticos')
    .select(DIAG_SELECT)
    .in('acta_id', actaIds)
    .order('fecha_creacion', { ascending: false })
    .limit(limite);

  if (opts.status) {
    query = query.eq('status', opts.status);
  } else if (opts.soloActivos) {
    query = query.in('status', ['pendiente', 'proceso']);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
