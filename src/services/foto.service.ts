import supabase from '../config/supabase';

const FOTOS_BUCKET = process.env.SUPABASE_FOTOS_BUCKET || 'fotos-actas';

function storageSafeSlug(value: unknown): string {
  return String(value || 'general')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'general';
}

export async function subirFotoBuffer(
  actaId: string, tipo: string, buffer: Buffer, mimetype: string, ext: string
): Promise<string> {
  const path = `actas/${actaId}/${tipo}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(FOTOS_BUCKET)
    .upload(path, buffer, { contentType: mimetype, upsert: true });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(FOTOS_BUCKET).getPublicUrl(path);

  const { error: dbError } = await supabase
    .from('fotos_acta')
    .insert({ acta_id: actaId, tipo, url: urlData.publicUrl });
  if (dbError) throw dbError;

  return urlData.publicUrl;
}

export async function subirFotoDiagnosticoBuffer(
  diagnosticoId: string, seccion: number, item: string | null,
  buffer: Buffer, mimetype: string, ext: string
): Promise<Record<string, unknown>> {
  const itemPath = storageSafeSlug(item);
  const path = `diagnosticos/${diagnosticoId}/s${seccion}/${itemPath}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(FOTOS_BUCKET)
    .upload(path, buffer, { contentType: mimetype, upsert: true });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(FOTOS_BUCKET).getPublicUrl(path);

  let query = supabase
    .from('diagnostico_fotos')
    .select('orden')
    .eq('diagnostico_id', diagnosticoId)
    .eq('seccion', seccion)
    .order('orden', { ascending: false })
    .limit(1);
  query = item ? query.eq('item', item) : query.is('item', null);
  const { data: ultima } = await (query as typeof query).maybeSingle();

  const { data, error: dbError } = await supabase
    .from('diagnostico_fotos')
    .insert({
      diagnostico_id: diagnosticoId, seccion, item: item || null,
      url: urlData.publicUrl,
      orden: ((ultima as { orden?: number } | null)?.orden || 0) + 1,
    })
    .select()
    .single();

  if (dbError) throw dbError;
  return data;
}

export async function eliminarFotoDiagnostico(foto: { id?: string; diagnostico_id?: string; seccion?: number; url?: string }): Promise<void> {
  let query = supabase.from('diagnostico_fotos').delete();
  if (foto.id) {
    query = query.eq('id', foto.id);
  } else {
    query = query.eq('diagnostico_id', foto.diagnostico_id!).eq('seccion', foto.seccion!).eq('url', foto.url!);
  }
  const { error } = await query;
  if (error) throw error;
}
