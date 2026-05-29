import { Router, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import * as svc from '../services/tecnico.service';

const router = Router();
router.use(authenticate);

/** Técnicos activos: `id` = `perfiles.id` (usar como `tecnico_id` en OT). */
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limite = Number((req.query as { limite?: string }).limite) || 100;
    res.json(await svc.listarTecnicos(limite));
  } catch (e) { next(e); }
});

export default router;
