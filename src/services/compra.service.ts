import supabase from '../config/supabase';
import { cargarCotizacionCompleta } from './cotizacion.service';

// Una compra agrupa los repuestos a comprar de un presupuesto aprobado.
// items: [{ descripcion, cantidad, costo, comprado }]
type CompraItem = { descripcion: string; cantidad: number; costo: number; comprado: boolean };

function esRepuesto(it: { tipo?: string; descripcion?: string }): boolean {
  return String(it.tipo || '').toLowerCase().includes('repuesto') && Boolean(String(it.descripcion || '').trim());
}

/**
 * Crea la compra de repuestos de una cotización aprobada (idempotente: 1 por cotización).
 * Si la cotización no tiene repuestos, no crea nada.
 */
export async function crearCompraDesdeCotizacion(cot: any, otId?: string) {
  const items: CompraItem[] = ((cot.items || []) as any[])
    .filter(esRepuesto)
    .map((it) => ({
      descripcion: String(it.descripcion || ''),
      cantidad: Number(it.cantidad) || 1,
      costo: Number(it.costo_unitario) || 0,
      comprado: false,
    }));
  if (!items.length) return null;

  const { data: existente } = await supabase
    .from('compras').select('*').eq('cotizacion_id', cot.id).maybeSingle();
  if (existente) return existente;

  const veh = cot.vehiculos ?? cot.vista_cliente?.vehiculo_manual ?? {};
  const cli = cot.clientes ?? cot.vista_cliente?.cliente_manual ?? {};

  const { data, error } = await supabase
    .from('compras')
    .insert({
      cotizacion_id: cot.id,
      ot_id: otId ?? null,
      estado: 'pendiente',
      items,
      numero_cotizacion: cot.numero_cotizacion ?? null,
      patente: veh.patente ?? null,
      vehiculo: `${veh.marca ?? ''} ${veh.modelo ?? ''}`.trim() || null,
      cliente: cli.nombre ?? null,
    })
    .select()
    .single();

  // Si dos aprobaciones corren a la vez, el unique(cotizacion_id) puede chocar: devolver la existente.
  if (error) {
    if (error.code === '23505') {
      const { data: yaCreada } = await supabase
        .from('compras').select('*').eq('cotizacion_id', cot.id).maybeSingle();
      return yaCreada;
    }
    throw error;
  }
  return data;
}

/** Crea la compra cargando la cotización por id (para el botón "crear lista" al iniciar OT). */
export async function crearCompraDesdeCotizacionId(cotizacionId: string, otId?: string) {
  const cot = await cargarCotizacionCompleta(cotizacionId);
  return crearCompraDesdeCotizacion(cot, otId);
}

export async function listarCompras(estado?: string) {
  let query = supabase.from('compras').select('*').order('created_at', { ascending: false });
  if (estado) query = query.eq('estado', estado);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function obtenerCompra(id: string) {
  const { data, error } = await supabase.from('compras').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function actualizarItems(id: string, items: CompraItem[]) {
  const { data, error } = await supabase
    .from('compras').update({ items }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function completarCompra(id: string, userId?: string) {
  const compra = await obtenerCompra(id) as { items?: CompraItem[] };
  const items = compra.items || [];
  if (!items.every((it) => it.comprado)) {
    const err = new Error('Faltan repuestos por marcar como comprados') as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  const { data, error } = await supabase
    .from('compras')
    .update({ estado: 'completada', completada_at: new Date().toISOString(), completada_por: userId ?? null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function eliminarCompra(id: string) {
  const { error } = await supabase.from('compras').delete().eq('id', id);
  if (error) throw error;
  return { ok: true };
}

export async function contarPendientes(): Promise<number> {
  const { count, error } = await supabase
    .from('compras').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente');
  if (error) throw error;
  return count || 0;
}
