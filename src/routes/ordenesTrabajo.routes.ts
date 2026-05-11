import { Router, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import requireRole from '../middleware/roleGuard';
import { OTUpdateSchema } from '../models/ordenTrabajo.model';
import * as svc from '../services/ordenTrabajo.service';

const router = Router();
router.use(authenticate);
const p = (req: AuthRequest) => req.params as Record<string, string>;

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, limite } = req.query as Record<string, string>;
    res.json(await svc.listarOTs(Number(limite) || 30, status));
  } catch (e) { next(e); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.cargarOTCompleta(p(req).id));
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('admin', 'tecnico'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = OTUpdateSchema.parse(req.body);
    res.json(await svc.actualizarOT(p(req).id, datos));
  } catch (e) { next(e); }
});

router.patch('/:id/asignar', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { tecnico_id, tecnico_nombre } = req.body as { tecnico_id?: string; tecnico_nombre?: string };
    res.json(await svc.actualizarOT(p(req).id, {
      status: 'asignada',
      tecnico_id: tecnico_id || null,
      tecnico_nombre: tecnico_nombre || null,
      nota_historial: `Asignado a técnico: ${tecnico_nombre || ''}`,
    }));
  } catch (e) { next(e); }
});

export default router;
