import { Router, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import requireRole from '../middleware/roleGuard';
import * as svc from '../services/dashboard.service';

const router = Router();
router.use(authenticate);

router.get('/resumen', requireRole('admin', 'recepcionista'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { fecha_desde, fecha_hasta } = req.query as Record<string, string>;
    res.json(await svc.obtenerResumen({ fecha_desde, fecha_hasta }));
  } catch (e) { next(e); }
});

export default router;
