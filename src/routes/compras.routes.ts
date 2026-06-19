import { Router, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import requireRole from '../middleware/roleGuard';
import * as svc from '../services/compra.service';

const router = Router();
router.use(authenticate);
router.use(requireRole('admin', 'recepcionista'));

const p = (req: AuthRequest) => req.params as Record<string, string>;

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { estado } = req.query as Record<string, string>;
    res.json(await svc.listarCompras(estado));
  } catch (e) { next(e); }
});

router.get('/pendientes/count', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ count: await svc.contarPendientes() });
  } catch (e) { next(e); }
});

// Crea (o devuelve) la lista de compra de un presupuesto. Usado por el popup al iniciar OT.
router.post('/desde-cotizacion/:cotizacionId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await svc.crearCompraDesdeCotizacionId(p(req).cotizacionId));
  } catch (e) { next(e); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.obtenerCompra(p(req).id));
  } catch (e) { next(e); }
});

router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body as { items: unknown[] };
    res.json(await svc.actualizarItems(p(req).id, items as never));
  } catch (e) { next(e); }
});

router.patch('/:id/completar', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.completarCompra(p(req).id, req.user?.id));
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.eliminarCompra(p(req).id));
  } catch (e) { next(e); }
});

export default router;
