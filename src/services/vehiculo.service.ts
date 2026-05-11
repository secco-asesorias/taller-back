import supabase from '../config/supabase';
import { Vehiculo } from '../models/vehiculo.model';

export async function upsertVehiculo(datos: Partial<Vehiculo> & { id?: string }): Promise<Record<string, unknown>> {
  const payload = { ...datos, patente: datos.patente?.toUpperCase() };
  const { data, error } = await supabase
    .from('vehiculos')
    .upsert(payload, { onConflict: 'patente' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function obtenerVehiculoPorId(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('vehiculos')
    .select('*, clientes(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function buscarVehiculoPorPatente(patente: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('vehiculos')
    .select('*, clientes(*)')
    .ilike('patente', patente.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listarVehiculosPorCliente(clienteId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('vehiculos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listarVehiculos(limite = 50, search = ''): Promise<Record<string, unknown>[]> {
  let query = supabase
    .from('vehiculos')
    .select('*, clientes(*)')
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(`patente.ilike.%${search}%,marca.ilike.%${search}%,modelo.ilike.%${search}%`);
  }

  const { data, error } = await query.limit(limite);
  if (error) throw error;
  return data || [];
}

export async function eliminarVehiculo(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('vehiculos')
    .delete()
    .eq('id', id)
    .select('id')
    .single();
  if (error) throw error;
  return data;
}
