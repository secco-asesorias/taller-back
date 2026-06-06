import supabase from '../config/supabase';

const SLOTS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
const MAX_POR_SLOT = 1;

export async function listarHorariosDisponibles(fecha: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('reservas')
    .select('hora_inicio')
    .eq('fecha', fecha)
    .in('estado', ['pendiente', 'confirmada']);
  if (error) throw error;

  const ocupados: Record<string, number> = {};
  for (const r of (data || [])) {
    const hora = String(r.hora_inicio).slice(0, 5);
    ocupados[hora] = (ocupados[hora] || 0) + 1;
  }

  return SLOTS
    .filter(hora => (ocupados[hora] || 0) < MAX_POR_SLOT)
    .map(hora => ({
      id: hora,
      hora_inicio: hora,
      hora_fin: `${String(Number(hora.split(':')[0]) + 1).padStart(2, '0')}:00`,
      cupos_restantes: MAX_POR_SLOT - (ocupados[hora] || 0),
    }));
}
