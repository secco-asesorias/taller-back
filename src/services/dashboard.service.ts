import supabase from '../config/supabase';

interface ResumenParams {
  fecha_desde?: string;
  fecha_hasta?: string;
}

function enRango(fecha: string | null | undefined, desde: string, hasta: string): boolean {
  if (!fecha) return false;
  const f = fecha.slice(0, 10);
  return f >= desde && f <= hasta;
}

export async function obtenerResumen({ fecha_desde, fecha_hasta }: ResumenParams) {
  const hoy = new Date().toISOString().slice(0, 10);
  const desde = fecha_desde || hoy.slice(0, 7) + '-01';
  const hasta = fecha_hasta || hoy;

  // Cotizaciones aprobadas con acta para filtrar por fecha_ingreso
  const { data: cots, error: errCots } = await supabase
    .from('cotizaciones')
    .select('total_final_cliente, costo_total, utilidad, margen, acta_id, created_at, actas(fecha_ingreso)')
    .eq('status', 'aprobada');
  if (errCots) throw errCots;

  const cotsEnRango = (cots || []).filter((c: any) => {
    const fecha = (c.actas as any)?.fecha_ingreso || (c.created_at as string)?.slice(0, 10);
    return enRango(fecha, desde, hasta);
  });

  const ingresos = cotsEnRango.reduce((s: number, c: any) => s + (Number(c.total_final_cliente) || 0), 0);
  const costos = cotsEnRango.reduce((s: number, c: any) => s + (Number(c.costo_total) || 0), 0);
  const utilidad = cotsEnRango.reduce((s: number, c: any) => s + (Number(c.utilidad) || 0), 0);
  const margen_promedio = cotsEnRango.length > 0
    ? cotsEnRango.reduce((s: number, c: any) => s + (Number(c.margen) || 0), 0) / cotsEnRango.length
    : 0;

  // Actas de recepción cerradas en el rango
  const { data: actas, error: errActas } = await supabase
    .from('actas')
    .select('id, fecha_ingreso, vehiculo_id')
    .eq('status', 'cerrada');
  if (errActas) throw errActas;

  const actasEnRango = (actas || []).filter((a: any) => enRango(a.fecha_ingreso, desde, hasta));
  const cantidad_ingresos = actasEnRango.length;

  // Actas de entrega en el rango
  const { data: entregas, error: errEntregas } = await supabase
    .from('actas_entrega')
    .select('id, fecha_entrega, vehiculo_id');
  if (errEntregas) throw errEntregas;

  const entregasEnRango = (entregas || []).filter((e: any) => enRango(e.fecha_entrega, desde, hasta));
  const cantidad_egresos = entregasEnRango.length;

  // Vehículos con ciclo completo: acta cerrada + acta entrega, ambas en rango
  const vehiculosConEntrega = new Set(
    entregasEnRango.map((e: any) => e.vehiculo_id).filter(Boolean),
  );
  const vehiculos_ciclo_completo = actasEnRango.filter(
    (a: any) => a.vehiculo_id && vehiculosConEntrega.has(a.vehiculo_id),
  ).length;

  // OTs finalizadas/entregadas con tiempos registrados
  const { data: ots, error: errOts } = await supabase
    .from('ordenes_trabajo')
    .select('inicio_servicio, termino_servicio, pausas')
    .in('status', ['finalizada', 'entregada'])
    .not('inicio_servicio', 'is', null)
    .not('termino_servicio', 'is', null);
  if (errOts) throw errOts;

  const otsEnRango = (ots || []).filter((o: any) =>
    enRango((o.termino_servicio as string)?.slice(0, 10), desde, hasta),
  );

  let tiempo_promedio_horas = 0;
  if (otsEnRango.length > 0) {
    const tiempos = otsEnRango.map((o: any) => {
      const inicio = new Date(o.inicio_servicio).getTime();
      const fin = new Date(o.termino_servicio).getTime();
      const pausasMs = ((o.pausas as any[]) || [])
        .filter((p: any) => p.estado === 'autorizada' && p.inicio && p.fin)
        .reduce((s: number, p: any) => s + (new Date(p.fin).getTime() - new Date(p.inicio).getTime()), 0);
      return Math.max(0, fin - inicio - pausasMs) / (1000 * 60 * 60);
    });
    tiempo_promedio_horas = tiempos.reduce((s: number, t: number) => s + t, 0) / tiempos.length;
  }

  return {
    ingresos: Math.round(ingresos),
    costos: Math.round(costos),
    utilidad: Math.round(utilidad),
    margen_promedio: Number(margen_promedio.toFixed(1)),
    cantidad_ingresos,
    cantidad_egresos,
    vehiculos_ciclo_completo,
    ots_completadas: otsEnRango.length,
    tiempo_promedio_horas: Number(tiempo_promedio_horas.toFixed(1)),
  };
}
