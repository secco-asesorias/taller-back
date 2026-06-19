import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import authenticate, { AuthRequest } from '../middleware/auth';
import requireRole from '../middleware/roleGuard';
import { UsuarioCreateSchema } from '../models/usuario.model';
import * as svc from '../services/usuario.service';

const UsuarioUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  rol: z.enum(['admin', 'recepcionista', 'tecnico']).optional(),
});

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

router.put('/:id', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = UsuarioUpdateSchema.parse(req.body);
    res.json(await svc.actualizarUsuario((req.params as { id: string }).id, datos));
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = (req.params as { id: string }).id;
    if (id === req.user?.id) {
      res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
      return;
    }
    res.json(await svc.eliminarUsuario(id));
  } catch (e) { next(e); }
});

export default router;
