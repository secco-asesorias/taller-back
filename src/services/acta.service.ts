import supabase from '../config/supabase';
import { upsertCliente } from './cliente.service';
import { upsertVehiculo } from './vehiculo.service';
import { ActaCreate, ActaUpdate } from '../models/acta.model';

const ACTA_SELECT = `
  id, numero_acta, fecha_ingreso, hora_ingreso, status, created_at, updated_at,
  km, combustible, tecnico_nombre, tc_nombre, cliente_id, vehiculo_id,
  clientes (id, nombre, rut, email, telefono),
  vehiculos (id, marca, modelo, patente, anio, color)
`;

interface BorradorInput {
  acta_id?: string | null;
  cliente_id?: string | null;
  vehiculo_id?: string | null;

  nombre: string; rut: string; telefono?: string; email?: string;
  marca?: string; modelo?: string; anio?: number | string | null; patente?: string | null;
  vin?: string; color?: string; fecha_ingreso: string; hora_ingreso?: string;

  km?: number | null;
  combustible?: string | null;
  llaves?: boolean | number | null;
  documentacion?: string[] | null;
  estado_exterior?: string | null;
  detalle_exterior?: string | null;
  estado_interior?: string | null;
  detalle_interior?: string | null;
  trabajo_solicitado?: string | null;
  acepta_declaracion?: boolean | null;
  acepta_responsabilidad_objetos?: boolean | null;
  acepta_pruebas_ruta?: boolean | null;
  firma_cliente_url?: string | null;
  firma_secco_url?: string | null;
  tecnico_nombre?: string | null;
  tc_nombre?: string | null;
  checklist_completo?: boolean | null;
  status?: 'borrador' | 'cerrada' | null;
}

export async function guardarBorrador(formData: BorradorInput) {
  const marca = (formData.marca || '').trim() || 'PENDIENTE';
  const modelo = (formData.modelo || '').trim() || 'PENDIENTE';
  const patenteRaw = (formData.patente || '').trim().toUpperCase();
  const patente = patenteRaw || `TMP${Date.now().toString(36).slice(-7).toUpperCase()}`; // max 10 chars
  const anioParsed = typeof formData.anio === 'string' ? Number(formData.anio) : (formData.anio ?? NaN);
  const anio = Number.isFinite(anioParsed) && anioParsed >= 1900 ? anioParsed : new Date().getFullYear();

  const cliente = await upsertCliente({
    nombre: formData.nombre, rut: formData.rut,
    telefono: formData.telefono, email: formData.email,
  });

  const vehiculo = await upsertVehiculo({
    marca, modelo, anio,
    patente, vin: formData.vin || null,
    color: formData.color || null, cliente_id: cliente.id as string,
  });

  const patch: Record<string, unknown> = {
    cliente_id: cliente.id,
    vehiculo_id: vehiculo.id,
    fecha_ingreso: formData.fecha_ingreso,
    hora_ingreso: formData.hora_ingreso ?? null,
    status: formData.status || 'borrador',
    km: typeof formData.km === 'number' ? formData.km : undefined,
    combustible: formData.combustible ?? undefined,
    llaves: formData.llaves ?? undefined,
    documentacion: formData.documentacion ?? undefined,
    estado_exterior: formData.estado_exterior ?? undefined,
    detalle_exterior: formData.detalle_exterior ?? undefined,
    estado_interior: formData.estado_interior ?? undefined,
    detalle_interior: formData.detalle_interior ?? undefined,
    trabajo_solicitado: formData.trabajo_solicitado ?? undefined,
    acepta_declaracion: formData.acepta_declaracion ?? undefined,
    acepta_responsabilidad_objetos: formData.acepta_responsabilidad_objetos ?? undefined,
    acepta_pruebas_ruta: formData.acepta_pruebas_ruta ?? undefined,
    firma_cliente_url: formData.firma_cliente_url ?? undefined,
    firma_secco_url: formData.firma_secco_url ?? undefined,
    tecnico_nombre: formData.tecnico_nombre ?? undefined,
    tc_nombre: formData.tc_nombre ?? undefined,
    checklist_completo: formData.checklist_completo ?? undefined,
    updated_at: new Date().toISOString(),
  };

  // remove undefined to avoid overwriting columns unintentionally
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

  // If the client sends an acta_id, we update that draft directly.
  if (formData.acta_id) {
    const { data, error } = await supabase
      .from('actas')
      .update(patch)
      .eq('id', formData.acta_id)
      .select()
      .single();
    if (error) throw error;
    return { acta: data, cliente, vehiculo, reutilizado: true };
  }

  const { data: existente } = await supabase
    .from('actas')
    .select('id, numero_acta')
    .eq('vehiculo_id', vehiculo.id)
    .eq('status', 'borrador')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existente) {
    const { data, error } = await supabase
      .from('actas')
      .update(patch)
      .eq('id', existente.id)
      .select()
      .single();
    if (error) throw error;
    return { acta: data, cliente, vehiculo, reutilizado: true };
  }

  const { data: acta, error } = await supabase
    .from('actas')
    .insert({
      vehiculo_id: vehiculo.id,
      cliente_id: cliente.id,
      fecha_ingreso: formData.fecha_ingreso,
      hora_ingreso: formData.hora_ingreso ?? null,
      km: typeof formData.km === 'number' ? formData.km : 0,
      combustible: formData.combustible || 'pendiente',
      status: formData.status || 'borrador',
      checklist_completo: formData.checklist_completo ?? false,
      llaves: formData.llaves ?? null,
      documentacion: formData.documentacion ?? [],
      estado_exterior: formData.estado_exterior ?? null,
      detalle_exterior: formData.detalle_exterior ?? null,
      estado_interior: formData.estado_interior ?? null,
      detalle_interior: formData.detalle_interior ?? null,
      trabajo_solicitado: formData.trabajo_solicitado ?? null,
      acepta_declaracion: formData.acepta_declaracion ?? null,
      acepta_responsabilidad_objetos: formData.acepta_responsabilidad_objetos ?? null,
      acepta_pruebas_ruta: formData.acepta_pruebas_ruta ?? null,
      firma_cliente_url: formData.firma_cliente_url ?? null,
      firma_secco_url: formData.firma_secco_url ?? null,
      tecnico_nombre: formData.tecnico_nombre ?? null,
      tc_nombre: formData.tc_nombre ?? null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return { acta, cliente, vehiculo, reutilizado: false };
}

export async function crearActa(datos: ActaCreate) {
  if (!datos.vehiculo_id) throw new Error('No se puede crear un acta sin vehículo asociado.');
  const { data, error } = await supabase.from('actas').insert(datos).select().single();
  if (error) throw error;
  return data;
}

export async function actualizarActa(id: string, datos: ActaUpdate) {
  const { data, error } = await supabase
    .from('actas')
    .update({ ...datos, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listarActas({ status, limite = 30 }: { status?: string; limite?: number } = {}) {
  let query = supabase
    .from('actas')
    .select(ACTA_SELECT)
    .not('vehiculo_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limite);

  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function cargarActaCompleta(actaId: string) {
  const { data, error } = await supabase
    .from('actas')
    .select('*, clientes(*), vehiculos(*), fotos_acta(tipo, url)')
    .eq('id', actaId)
    .single();
  if (error) throw error;
  return data;
}

export async function buscarBorradorPorPatente(patente: string) {
  const patenteNorm = patente.trim().toUpperCase();
  const { data: vehiculo } = await supabase
    .from('vehiculos').select('id').ilike('patente', patenteNorm).single();

  if (!vehiculo) return [];

  const { data, error } = await supabase
    .from('actas')
    .select(ACTA_SELECT)
    .eq('vehiculo_id', (vehiculo as { id: string }).id)
    .eq('status', 'borrador')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function eliminarActa(id: string) {
  const { data, error } = await supabase
    .from('actas')
    .delete()
    .eq('id', id)
    .select('id')
    .single();

  if (error) throw error;
  return data;
}
