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
    const { tecnico_id } = req.body as { tecnico_id?: string };
    if (!tecnico_id?.trim()) {
      res.status(400).json({ error: 'tecnico_id es requerido (id de perfiles del técnico)' });
      return;
    }
    res.json(await svc.asignarTecnicoOT(p(req).id, tecnico_id.trim()));
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
