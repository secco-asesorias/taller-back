import supabase from '../config/supabase';

type PerfilTecnico = { id: string; nombre?: string | null; email?: string | null; rol?: string };

export function nombreTecnicoDesdePerfil(perfil: Pick<PerfilTecnico, 'nombre' | 'email'>) {
  return perfil.nombre?.trim() || perfil.email?.split('@')[0] || perfil.email || 'Técnico';
}

export async function upsertTecnico(id: string, nombre: string) {
  const { error } = await supabase
    .from('tecnicos')
    .upsert({ id, nombre, activo: true }, { onConflict: 'id' });
  if (error) throw error;
}

export async function resolverTecnicoPorPerfilId(perfilId: string) {
  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('id, nombre, email, rol')
    .eq('id', perfilId)
    .maybeSingle();

  if (error) throw error;
  if (!perfil || perfil.rol !== 'tecnico') {
    const err = new Error('Técnico no encontrado o el usuario no tiene rol técnico') as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  const nombre = nombreTecnicoDesdePerfil(perfil);
  await upsertTecnico(perfil.id, nombre);
  return { id: perfil.id, nombre };
}

export async function listarTecnicos(limite = 100) {
  const { data: perfiles, error } = await supabase
    .from('perfiles')
    .select('id, nombre, email, rol')
    .eq('rol', 'tecnico')
    .order('nombre', { ascending: true })
    .limit(limite);

  if (error) throw error;

  const rows = (perfiles || []).map((p) => ({
    id: p.id,
    nombre: nombreTecnicoDesdePerfil(p),
  }));

  if (rows.length) {
    const { error: upsertErr } = await supabase
      .from('tecnicos')
      .upsert(rows.map((r) => ({ id: r.id, nombre: r.nombre, activo: true })), { onConflict: 'id' });
    if (upsertErr) throw upsertErr;
  }

  return rows;
}
