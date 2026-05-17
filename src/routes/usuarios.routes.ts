import { Router, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import requireRole from '../middleware/roleGuard';
import { UsuarioCreateSchema } from '../models/usuario.model';
import * as svc from '../services/usuario.service';

const router = Router();
router.use(authenticate);

/** Usuario autenticado (token Bearer) + perfil en `perfiles`. */
router.get('/me', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.obtenerUsuarioActual(req.user!.id, req.user!.email));
  } catch (e) { next(e); }
});

router.get('/', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limite = Number((req.query as { limite?: string }).limite) || 50;
    res.json(await svc.listarUsuarios(limite));
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = UsuarioCreateSchema.parse(req.body);
    res.status(201).json(await svc.crearUsuario(datos));
  } catch (e) { next(e); }
});

export default router;
