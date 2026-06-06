import supabase from '../config/supabase';
import { Reserva } from '../models/reserva.model';

const MAX_POR_SLOT = 1;

export async function crearReserva(datos: Reserva): Promise<Record<string, unknown>> {
  const { count, error: countError } = await supabase
    .from('reservas')
    .select('id', { count: 'exact', head: true })
    .eq('fecha', datos.fecha)
    .eq('hora_inicio', datos.hora_inicio)
    .in('estado', ['pendiente', 'confirmada']);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_POR_SLOT) throw new Error('No hay cupos disponibles en ese horario');

  const { data, error } = await supabase
    .from('reservas')
    .insert(datos)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listarReservas(filtros: {
  fecha?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  estado?: string;
}): Promise<Record<string, unknown>[]> {
  let query = supabase
    .from('reservas')
    .select('*')
    .order('fecha')
    .order('hora_inicio');

  if (filtros.fecha) query = query.eq('fecha', filtros.fecha);
  if (filtros.fecha_desde) query = query.gte('fecha', filtros.fecha_desde);
  if (filtros.fecha_hasta) query = query.lte('fecha', filtros.fecha_hasta);
  if (filtros.estado) query = query.eq('estado', filtros.estado);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function actualizarEstado(id: string, estado: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('reservas')
    .update({ estado })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function eliminarReserva(id: string): Promise<void> {
  const { error } = await supabase.from('reservas').delete().eq('id', id);
  if (error) throw error;
}
