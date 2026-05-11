import supabase from '../config/supabase';
import { Cliente } from '../models/cliente.model';

export async function upsertCliente(datos: Partial<Cliente> & { id?: string }): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('clientes')
    .upsert(datos, { onConflict: 'rut' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listarClientes(limite = 50, search = ''): Promise<Record<string, unknown>[]> {
  let query = supabase.from('clientes').select('*').order('nombre');
  if (search) query = query.or(`nombre.ilike.%${search}%,rut.ilike.%${search}%`);
  const { data, error } = await query.limit(limite);
  if (error) throw error;
  return data || [];
}

export async function obtenerClientePorId(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('clientes')
    .select('*, vehiculos(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function obtenerClientePorRut(rut: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('clientes')
    .select('*, vehiculos(*)')
    .eq('rut', rut)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function eliminarCliente(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('clientes')
    .delete()
    .eq('id', id)
    .select('id')
    .single();
  if (error) throw error;
  return data;
}
