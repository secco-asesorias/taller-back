import supabase from '../config/supabase';
import supabaseAdmin from '../config/supabaseAdmin';
import { UsuarioCreate } from '../models/usuario.model';

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'Ya existe un usuario con ese correo';
  }
  return message;
}

export async function crearUsuario(datos: UsuarioCreate) {
  const { email, password, rol, nombre } = datos;

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: nombre ? { nombre } : undefined,
  });

  if (authError) {
    throw new Error(mapAuthError(authError.message));
  }

  const userId = authData.user?.id;
  if (!userId) throw new Error('No se pudo crear el usuario en Auth');

  const perfilRow: Record<string, unknown> = {
    id: userId,
    rol,
    email,
  };
  if (nombre) perfilRow.nombre = nombre;

  const { data: perfil, error: perfilError } = await supabase
    .from('perfiles')
    .insert(perfilRow)
    .select('id, email, nombre, rol, created_at')
    .single();

  if (perfilError) {
    await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
    throw perfilError;
  }

  return {
    id: userId,
    email,
    rol,
    nombre: perfil?.nombre ?? nombre ?? null,
    created_at: perfil?.created_at ?? null,
  };
}

export async function obtenerUsuarioActual(userId: string, emailAuth?: string) {
  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('id, email, nombre, rol, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!perfil) {
    const err = new Error('Perfil no encontrado') as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  const p = perfil as { id: string; email?: string | null; nombre?: string | null; rol: string; created_at?: string | null };
  return {
    id: p.id,
    email: p.email ?? emailAuth ?? null,
    nombre: p.nombre ?? null,
    rol: p.rol,
    created_at: p.created_at ?? null,
  };
}

export async function listarUsuarios(limite = 50) {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, email, nombre, rol, created_at')
    .in('rol', ['admin', 'recepcionista', 'tecnico'])
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) throw error;
  return data || [];
}
