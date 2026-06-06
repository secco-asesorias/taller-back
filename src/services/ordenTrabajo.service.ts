import supabase from '../config/supabase';
import { cargarCotizacionCompleta } from './cotizacion.service';
import { OTUpdate } from '../models/ordenTrabajo.model';
import { resolverTecnicoPorPerfilId } from './tecnico.service';

const OT_SELECT = `
  id, numero_ot, status, tecnico_nombre, tecnico_id, created_at, updated_at,
  observaciones, notas_torre, km_ingreso, inicio_servicio, termino_servicio,
  instrucciones,
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

export async function crearOTDesdeActa(actaId: string) {
  // 1. Duplicate check — si ya existe OT para esta acta, devolverla
  const { data: existente } = await supabase
    .from('ordenes_trabajo')
    .select('id, numero_ot, status')
    .eq('acta_id', actaId)
    .maybeSingle();
  if (existente) return existente;

  // 2. Obtener el acta
  const { data: acta, error: errActa } = await supabase
    .from('actas')
    .select('*, vehiculos:vehiculo_id(*), clientes:cliente_id(*)')
    .eq('id', actaId)
    .single();
  if (errActa) throw errActa;

  // 3. Buscar cotización vinculada al acta: primero por acta_id directo,
  //    si no se encuentra buscar también via diagnostico.
  let cot: Record<string, unknown> | null = null;

  const { data: cotDirecta } = await supabase
    .from('cotizaciones')
    .select('*')
    .eq('acta_id', actaId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cotDirecta) {
    cot = cotDirecta as Record<string, unknown>;
  } else {
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
      if (cotViaDiag) cot = cotViaDiag as Record<string, unknown>;
    }
  }

  // 4. Estructurar repuestos e instrucciones desde items de la cotización
  const { repuestos, instrucciones } = cot
    ? estructurarOTDesdeItems((cot as Record<string, unknown>).items as OTItem[] ?? [])
    : { repuestos: [], instrucciones: [] };

  // 5. Crear OT — numero_ot se asigna automáticamente por SERIAL
  const { data: ot, error: errOT } = await supabase
    .from('ordenes_trabajo')
    .insert({
      acta_id:       actaId,
      cotizacion_id: cot?.id ?? null,
      vehiculo_id:   (acta as Record<string, unknown>).vehiculo_id ?? null,
      cliente_id:    (acta as Record<string, unknown>).cliente_id ?? null,
      km_ingreso:    (acta as Record<string, unknown>).km ?? null,
      status:        'generada',
      repuestos,
      instrucciones,
      items:         (cot as Record<string, unknown> | null)?.items ?? [],
      observaciones: '',
      notas_torre:   '',
      historial: [{
        ts:     new Date().toISOString(),
        accion: 'OT generada desde acta',
        nota:   cot ? `COT-${(cot as Record<string, unknown>).numero_cotizacion}` : 'sin cotización',
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

  const { data: ot, error: errOT } = await supabase
    .from('ordenes_trabajo')
    .insert({
      cotizacion_id:  cotizacionId,
      acta_id:        cot.acta_id || null,
      vehiculo_id:    cot.vehiculo_id || null,
      cliente_id:     cot.cliente_id || null,
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
