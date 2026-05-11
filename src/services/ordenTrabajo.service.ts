import supabase from '../config/supabase';
import { cargarCotizacionCompleta } from './cotizacion.service';
import { OTUpdate } from '../models/ordenTrabajo.model';

const OT_SELECT = `
  id, numero_ot, status, tecnico_nombre, created_at, updated_at, observaciones, notas_torre,
  vehiculos:vehiculo_id (marca, modelo, patente),
  clientes:cliente_id (nombre, telefono)
`;

interface OTItem { descripcion?: string; tipo?: string; id?: string; cantidad?: number; precio_unitario?: number; }

function otItemId(prefix: string, index: number, text = ''): string {
  const slug = String(text || '').toLowerCase().normalize('NFD')
    .replace(/\p{Mn}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 22);
  return `${prefix}-${index + 1}${slug ? `-${slug}` : ''}`;
}

function estructurarOTDesdeItems(items: OTItem[] = []) {
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
    repuestos_ids: [] as string[],
    orden: i + 1,
    completada: false,
  }));

  if (!instrucciones.length && repuestos.length) {
    instrucciones.push({
      id: 'ins-1-revision-general',
      texto: 'Ejecutar trabajos aprobados según presupuesto y diagnóstico.',
      repuestos_ids: repuestos.map(r => r.id),
      orden: 1,
      completada: false,
    });
  }

  return { repuestos, instrucciones };
}

export async function aprobarCotizacionYCrearOT(cotizacionId: string) {
  const cot = await cargarCotizacionCompleta(cotizacionId) as Record<string, unknown>;
  const estructuraOT = estructurarOTDesdeItems((cot.items || []) as OTItem[]);

  const { error: errCot } = await supabase
    .from('cotizaciones')
    .update({ status: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', cotizacionId);
  if (errCot) throw errCot;

  const { data: ot, error: errOT } = await supabase
    .from('ordenes_trabajo')
    .insert({
      cotizacion_id: cotizacionId,
      acta_id: cot.acta_id || null,
      vehiculo_id: cot.vehiculo_id || null,
      cliente_id: cot.cliente_id || null,
      status: 'generada',
      items: cot.items || [],
      repuestos: estructuraOT.repuestos,
      instrucciones: estructuraOT.instrucciones,
      observaciones: cot.notas || '',
      notas_torre: '',
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

export async function listarOTs(limite = 30, status?: string) {
  let query = supabase
    .from('ordenes_trabajo')
    .select(OT_SELECT)
    .order('updated_at', { ascending: false })
    .limit(limite);

  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function actualizarOT(id: string, datos: OTUpdate) {
  const historialEntry = datos.status
    ? { ts: new Date().toISOString(), accion: `Estado cambiado a: ${datos.status}`, nota: datos.nota_historial || '' }
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
