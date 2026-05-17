import { Router, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import requireRole from '../middleware/roleGuard';
import { ActaEntregaCreateSchema, ActaEntregaUpdateSchema } from '../models/actaEntrega.model';
import * as svc from '../services/actaEntrega.service';

const router = Router();
router.use(authenticate);
const p = (req: AuthRequest) => req.params as Record<string, string>;

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, limite } = req.query as Record<string, string>;
    res.json(await svc.listarActasEntrega({ status, limite: Number(limite) || 30 }));
  } catch (e) { next(e); }
});

router.get('/borrador/patente/:patente', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.buscarBorradorEntregaPorPatente(p(req).patente));
  } catch (e) { next(e); }
});

/** Actas de entrega cuyo vehículo coincide con la patente (búsqueda parcial). */
router.get('/patente/:patente', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { limite, status } = req.query as Record<string, string>;
    res.json(await svc.buscarActasEntregaPorPatente(p(req).patente, {
      limite: Number(limite) || 30,
      status: status || undefined,
    }));
  } catch (e) { next(e); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.cargarActaEntregaCompleta(p(req).id));
  } catch (e) { next(e); }
});

router.post('/borrador', requireRole('admin', 'recepcionista'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await svc.guardarBorradorEntrega(req.body));
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'recepcionista'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = ActaEntregaCreateSchema.parse(req.body);
    res.status(201).json(await svc.crearActaEntrega(datos));
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('admin', 'recepcionista'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = ActaEntregaUpdateSchema.parse(req.body);
    res.json(await svc.actualizarActaEntrega(p(req).id, datos));
  } catch (e) { next(e); }
});

router.patch('/:id/cerrar', requireRole('admin', 'recepcionista'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.actualizarActaEntrega(p(req).id, { status: 'cerrada' }));
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.eliminarActaEntrega(p(req).id));
  } catch (e) { next(e); }
});

export default router;
