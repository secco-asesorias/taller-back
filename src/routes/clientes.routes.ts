import { Router, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import { ClienteSchema } from '../models/cliente.model';
import * as svc from '../services/cliente.service';

const router = Router();
router.use(authenticate);

const p = (req: AuthRequest) => req.params as Record<string, string>;

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { search, limite } = req.query as Record<string, string>;
    res.json(await svc.listarClientes(Number(limite) || 50, search));
  } catch (e) { next(e); }
});

router.get('/rut/:rut', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await svc.obtenerClientePorRut(p(req).rut);
    if (!data) { res.status(404).json({ error: 'Cliente no encontrado' }); return; }
    res.json(data);
  } catch (e) { next(e); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.obtenerClientePorId(p(req).id));
  } catch (e) { next(e); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = ClienteSchema.parse(req.body);
    res.status(201).json(await svc.upsertCliente(datos));
  } catch (e) { next(e); }
});

router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = ClienteSchema.partial().parse(req.body);
    res.json(await svc.upsertCliente({ id: p(req).id, ...datos }));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.eliminarCliente(p(req).id));
  } catch (e) { next(e); }
});

export default router;
