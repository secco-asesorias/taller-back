import { randomUUID } from 'crypto';
import supabase from '../config/supabase';
import { cargarOTCompleta } from './ordenTrabajo.service';
import { InformeUpdate } from '../models/informe.model';

// El informe es 1-a-1 con la OT. Todos los campos del formulario viven en `datos`
// (un objeto plano clave→valor). Qué campos existen, sus etiquetas y tipos se definen
// en el frontend (lib/informeCampos.js): esa es la fuente de verdad legible del informe.

type Datos = Record<string, unknown>;

// Correos internos del staff (no son del cliente aunque a veces quedan guardados ahí).
function esCorreoInterno(email: unknown): boolean {
  return String(email ?? '').toLowerCase().trim().endsWith('@seccoautomotriz.cl');
}

// El acta guarda el combustible como texto libre; lo mapeamos a las opciones del informe.
function mapCombustible(valor: unknown): string {
  const v = String(valor ?? '').toLowerCase();
  if (v.includes('bencina') || v.includes('gasolina')) return 'bencina';
  if (v.includes('diesel') || v.includes('diésel') || v.includes('petr')) return 'diesel';
  if (v.includes('hibrido') || v.includes('híbrido') || v.includes('hybrid')) return 'hibrido';
  return '';
}

// El acta guarda llaves como número (o boolean). Solo prellenamos si es número.
function mapLlaves(valor: unknown): string {
  if (typeof valor !== 'number' || valor < 1) return '';
  return String(Math.min(4, Math.round(valor)));
}

// Mapea el checklist de documentación del acta a los campos del informe (presente → 'al día').
function docsDesdeActa(documentacion: unknown): Datos {
  const arr = (Array.isArray(documentacion) ? documentacion : []).map((d) => String(d).toLowerCase());
  const tiene = (...tokens: string[]) => arr.some((d) => tokens.some((t) => d.includes(t)));
  const out: Datos = {};
  if (tiene('permiso')) out.doc_permisoCirculacion = 'al_dia';
  if (tiene('revision', 'revisión', 'técnica', 'tecnica')) out.doc_revisionTecnica = 'al_dia';
  if (tiene('soap')) out.doc_soap = 'al_dia';
  return out;
}

// La OT trae el vehículo, el cliente, el acta y la cotización anidados: copiamos al informe
// lo más posible para que el mecánico no reescriba lo que ya está cargado.
function prefillDesdeOT(ot: any): Datos {
  const acta = ot.actas ?? {};
  const vehManual = ot.cotizaciones?.vista_cliente?.vehiculo_manual ?? {};
  const cliManual = ot.cotizaciones?.vista_cliente?.cliente_manual ?? {};
  const veh = ot.vehiculos ?? acta.vehiculos ?? {};
  const cli = ot.clientes ?? acta.clientes ?? {};

  const correo = cli.email ?? cliManual.email;
  const km = ot.km_ingreso ?? acta.km ?? vehManual.km;

  return {
    marca: veh.marca || vehManual.marca || '',
    modelo: veh.modelo || vehManual.modelo || '',
    patente: veh.patente || vehManual.patente || '',
    ano: veh.anio || vehManual.anio || '',
    color: veh.color || '',
    kilometraje: km != null && km !== '' ? String(km) : '',
    combustible: mapCombustible(acta.combustible),
    cantidadLlaves: mapLlaves(acta.llaves),
    nombreCliente: cli.nombre || cliManual.nombre || '',
    telefonoCliente: cli.telefono || cliManual.telefono || '',
    // Si el correo guardado es de un mecánico/staff, no lo ponemos como correo del cliente.
    correoCliente: esCorreoInterno(correo) ? '' : (correo ?? ''),
    nombreMecanico: ot.tecnico_nombre ?? '',
    fecha: new Date().toISOString().slice(0, 10),
    // Documentación (papeles marcados en el acta → 'al día').
    ...docsDesdeActa(acta.documentacion),
    ...(String(acta.documentacion_otros ?? '').trim() ? { doc_comentarios: String(acta.documentacion_otros).trim() } : {}),
  };
}

// Crea el informe de una OT, o devuelve el que ya tiene (1 informe por OT).
export async function crearOInformeDesdeOT(otId: string) {
  const actual = await obtenerInformePorOT(otId);
  if (actual) return actual;

  const ot = await cargarOTCompleta(otId);
  const datos = prefillDesdeOT(ot);
  const rawPatente = String((datos as any).patente ?? '').toUpperCase().replace(/[\s-]/g, '');
  const slug = rawPatente ? `informe_${rawPatente}` : randomUUID();

  const insertar = (token: string) =>
    supabase
      .from('informes')
      .insert({
        ot_id: otId,
        vehiculo_id: (ot as any).vehiculo_id ?? null,
        cliente_id: (ot as any).cliente_id ?? null,
        share_token: token,
        status: 'borrador',
        datos,
      })
      .select()
      .single();

  const { data, error } = await insertar(slug);

  if (error?.code === '23505') {
    // Puede ser conflicto de ot_id (race condition) o de share_token (misma patente en otra OT).
    const existente = await obtenerInformePorOT(otId);
    if (existente) return existente;
    // Conflicto de token: reintentar con sufijo único.
    const { data: d2, error: e2 } = await insertar(`${slug}_${randomUUID().slice(0, 8)}`);
    if (e2) throw e2;
    return d2;
  }
  if (error) throw error;
  return data;
}

// Lista todos los informes con datos del cliente/vehículo tomados de la OT (siempre al día).
export async function listarInformes() {
  const { data, error } = await supabase
    .from('informes')
    .select(`id, created_at, ot_id, share_token, datos,
      ordenes_trabajo:ot_id ( numero_ot, cotizacion_id, vehiculos:vehiculo_id(patente, marca, modelo, anio), clientes:cliente_id(nombre) )`)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return ((data || []) as any[]).map((inf) => {
    const ot = inf.ordenes_trabajo ?? {};
    const veh = ot.vehiculos ?? {};
    const d = inf.datos ?? {};
    const vehiculo = `${veh.marca || d.marca || ''} ${veh.modelo || d.modelo || ''} ${veh.anio || d.ano || ''}`.trim();
    return {
      id: inf.id,
      created_at: inf.created_at,
      ot_id: inf.ot_id,
      share_token: inf.share_token,
      numero_ot: ot.numero_ot ?? null,
      cotizacion_id: ot.cotizacion_id ?? null,
      patente: veh.patente || d.patente || null,
      vehiculo: vehiculo || null,
      cliente: ot.clientes?.nombre || d.nombreCliente || null,
    };
  });
}

export async function obtenerInformePorOT(otId: string) {
  const { data, error } = await supabase
    .from('informes')
    .select('*')
    .eq('ot_id', otId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function obtenerInformePorId(id: string) {
  const { data, error } = await supabase.from('informes').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// Autosave: mezcla los campos nuevos con los guardados (no pisa lo que no se envía).
export async function actualizarInforme(id: string, cambios: InformeUpdate) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (cambios.datos) {
    const previo = await obtenerInformePorId(id);
    update.datos = { ...((previo as any).datos ?? {}), ...cambios.datos };
  }
  if (cambios.status) update.status = cambios.status;

  const { data, error } = await supabase
    .from('informes').update(update).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function finalizarInforme(id: string) {
  return actualizarInforme(id, { status: 'finalizado' });
}

export async function eliminarInforme(id: string) {
  const { error } = await supabase.from('informes').delete().eq('id', id);
  if (error) throw error;
  return { ok: true };
}

// Vista pública para el cliente (por token del link). No expone columnas internas.
export async function obtenerInformePublico(token: string) {
  const { data, error } = await supabase
    .from('informes')
    .select('share_token, status, datos, created_at, updated_at')
    .eq('share_token', token)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error('Informe no encontrado') as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  return data;
}
