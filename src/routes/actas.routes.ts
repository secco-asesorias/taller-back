import { Router, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import requireRole from '../middleware/roleGuard';
import { ActaCreateSchema, ActaUpdateSchema } from '../models/acta.model';
import * as svc from '../services/acta.service';

const router = Router();
router.use(authenticate);
const p = (req: AuthRequest) => req.params as Record<string, string>;

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, limite } = req.query as Record<string, string>;
    res.json(await svc.listarActas({ status, limite: Number(limite) || 30 }));
  } catch (e) { next(e); }
});

router.get('/borrador/patente/:patente', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.buscarBorradorPorPatente(p(req).patente));
  } catch (e) { next(e); }
});

/** Actas cuyo vehículo coincide con la patente (búsqueda parcial). Query: limite, status opcionales. */
router.get('/patente/:patente', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { limite, status } = req.query as Record<string, string>;
    res.json(await svc.buscarActasPorPatente(p(req).patente, {
      limite: Number(limite) || 30,
      status: status || undefined,
    }));
  } catch (e) { next(e); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.cargarActaCompleta(p(req).id));
  } catch (e) { next(e); }
});

router.post('/borrador', requireRole('admin', 'recepcionista'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await svc.guardarBorrador(req.body));
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'recepcionista'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = ActaCreateSchema.parse(req.body);
    res.status(201).json(await svc.crearActa(datos));
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('admin', 'recepcionista'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = ActaUpdateSchema.parse(req.body);
    res.json(await svc.actualizarActa(p(req).id, datos));
  } catch (e) { next(e); }
});

router.patch('/:id/cerrar', requireRole('admin', 'recepcionista'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.actualizarActa(p(req).id, { status: 'cerrada' }));
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.eliminarActa(p(req).id));
  } catch (e) { next(e); }
});

export default router;
