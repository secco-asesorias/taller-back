import { Router, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import requireRole from '../middleware/roleGuard';
import { OTUpdateSchema } from '../models/ordenTrabajo.model';
import * as svc from '../services/ordenTrabajo.service';
import * as actaEntregaSvc from '../services/actaEntrega.service';
import supabase from '../config/supabase';

const router = Router();
router.use(authenticate);
const p = (req: AuthRequest) => req.params as Record<string, string>;

// ── Listar OTs (opcionalmente filtradas por status y/o tecnico_id) ─────────
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, limite, tecnico_id } = req.query as Record<string, string>;
    res.json(await svc.listarOTs(Number(limite) || 30, status, tecnico_id));
  } catch (e) { next(e); }
});

// ── Cargar OT completa ─────────────────────────────────────────────────────
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.cargarOTCompleta(p(req).id));
  } catch (e) { next(e); }
});

// ── Actualizar OT (TC o técnico asignado) ─────────────────────────────────
router.put('/:id', requireRole('admin', 'tecnico'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = OTUpdateSchema.parse(req.body);
    res.json(await svc.actualizarOT(p(req).id, datos));
  } catch (e) { next(e); }
});

// ── Asignar técnico (por tecnico_id o por email) ───────────────────────────
router.patch('/:id/asignar', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    let { tecnico_id, tecnico_nombre, email } = req.body as {
      tecnico_id?: string;
      tecnico_nombre?: string;
      email?: string;
    };

    // Si viene email, buscar el técnico en perfiles
    if (email && !tecnico_id) {
      const { data: perfil, error } = await supabase
        .from('perfiles')
        .select('id, nombre')
        .eq('email', email.trim().toLowerCase())
        .eq('rol', 'tecnico')
        .maybeSingle();

      if (error) throw error;
      if (!perfil) {
        res.status(404).json({ error: `No se encontró un técnico con email: ${email}` });
        return;
      }
      tecnico_id = (perfil as { id: string; nombre: string }).id;
      tecnico_nombre = (perfil as { id: string; nombre: string }).nombre;
    }

    res.json(await svc.actualizarOT(p(req).id, {
      status:         'asignada',
      tecnico_id:     tecnico_id || null,
      tecnico_nombre: tecnico_nombre || null,
      nota_historial: `Asignado a técnico: ${tecnico_nombre || email || ''}`,
    }));
  } catch (e) { next(e); }
});

// ── Mecánico inicia la OT ──────────────────────────────────────────────────
router.patch('/:id/iniciar-ot', requireRole('tecnico', 'admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ot = await svc.cargarOTCompleta(p(req).id);
    const otData = ot as Record<string, unknown>;

    // Ownership check para técnicos
    if (req.perfil?.rol === 'tecnico' && otData.tecnico_id !== req.user?.id) {
      res.status(403).json({ error: 'Esta OT no está asignada a tu usuario' });
      return;
    }

    res.json(await svc.actualizarOT(p(req).id, {
      status:          'en_proceso',
      inicio_servicio: new Date().toISOString(),
      nota_historial:  'Servicio iniciado por el técnico',
    }));
  } catch (e) { next(e); }
});

// ── Mecánico termina la OT → pasa a revisión del TC ──────────────────────
router.patch('/:id/terminar-ot', requireRole('tecnico', 'admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ot = await svc.cargarOTCompleta(p(req).id);
    const otData = ot as Record<string, unknown>;

    // Ownership check para técnicos
    if (req.perfil?.rol === 'tecnico' && otData.tecnico_id !== req.user?.id) {
      res.status(403).json({ error: 'Esta OT no está asignada a tu usuario' });
      return;
    }

    res.json(await svc.actualizarOT(p(req).id, {
      status:           'en_revision',
      termino_servicio: new Date().toISOString(),
      nota_historial:   'Servicio terminado por el técnico — en espera de revisión TC',
    }));
  } catch (e) { next(e); }
});

// ── TC aprueba y finaliza la OT ───────────────────────────────────────────
router.patch('/:id/aprobar', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.actualizarOT(p(req).id, {
      status:         'finalizada',
      nota_historial: 'OT aprobada y finalizada por Torre de Control',
    }));
  } catch (e) { next(e); }
});

// ── TC entrega el vehículo → actualiza OT + crea acta de entrega ──────────
router.patch('/:id/entregar', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ot = await svc.cargarOTCompleta(p(req).id) as Record<string, unknown>;

    const updated = await svc.actualizarOT(p(req).id, {
      status:         'entregada',
      nota_historial: 'Vehículo entregado al cliente',
    });

    if (ot.vehiculo_id && ot.cliente_id) {
      const now = new Date();
      const hh = now.getHours().toString().padStart(2, '0');
      const mm = now.getMinutes().toString().padStart(2, '0');
      const ss = now.getSeconds().toString().padStart(2, '0');

      // Formatear trabajo realizado para el acta
      const instrucciones = (ot.instrucciones as Array<Record<string,unknown>>) || [];
      const repuestos     = (ot.repuestos     as Array<Record<string,unknown>>) || [];
      const lines: string[] = [];

      if (instrucciones.length) {
        lines.push('TAREAS REALIZADAS:');
        instrucciones.forEach((ins, i) => {
          const hs = ins.horas ? ` (${ins.horas} hs)` : '';
          lines.push(`${i + 1}. ${ins.texto}${hs}`);
        });
        const totalHs = instrucciones.reduce((s, i) => s + (Number(i.horas) || 0), 0);
        if (totalHs > 0) lines.push(`Total mano de obra: ${totalHs} hs`);
      }

      if (repuestos.length) {
        if (lines.length) lines.push('');
        lines.push('REPUESTOS UTILIZADOS:');
        let totalPrecio = 0;
        repuestos.forEach((r) => {
          const precio = Number(r.precio || 0);
          const cant   = Number(r.cantidad || 1);
          totalPrecio += precio * cant;
          const sub = precio > 0 ? ` — $${(precio * cant).toLocaleString('es-CL')}` : '';
          lines.push(`• ${r.nombre} x${cant}${sub}`);
        });
        if (totalPrecio > 0) lines.push(`Total repuestos: $${totalPrecio.toLocaleString('es-CL')}`);
      }

      const acta = await actaEntregaSvc.crearActaEntrega({
        vehiculo_id:   ot.vehiculo_id as string,
        cliente_id:    ot.cliente_id as string,
        fecha_entrega: now.toISOString().split('T')[0],
        hora_entrega:  `${hh}:${mm}:${ss}`,
        km:            (ot.km_ingreso as number) || 0,
        combustible:   'pendiente',
      });

      const actaId = (acta as Record<string,unknown>)?.id as string | undefined;
      if (actaId && lines.length) {
        await supabase.from('actas_entrega').update({
          trabajo_solicitado: lines.join('\n'),
          tecnico_nombre:     (ot.tecnico_nombre as string) || null,
          updated_at:         new Date().toISOString(),
        }).eq('id', actaId);
      }
    }

    res.json(updated);
  } catch (e) { next(e); }
});

// ── Eliminar OT (solo admin) ──────────────────────────────────────────────
router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { error } = await supabase.from('ordenes_trabajo').delete().eq('id', p(req).id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
