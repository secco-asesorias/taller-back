import { Router, Request, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import { ReservaSchema, EstadoReservaSchema } from '../models/reserva.model';
import * as svc from '../services/reserva.service';

const router = Router();

const p = (req: Request) => req.params as Record<string, string>;

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const datos = ReservaSchema.parse(req.body);
    res.status(201).json(await svc.crearReserva(datos));
  } catch (e) { next(e); }
});

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { fecha, fecha_desde, fecha_hasta, estado } = req.query as Record<string, string>;
    res.json(await svc.listarReservas({ fecha, fecha_desde, fecha_hasta, estado }));
  } catch (e) { next(e); }
});

router.patch('/:id/estado', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { estado } = EstadoReservaSchema.parse(req.body);
    res.json(await svc.actualizarEstado(p(req).id, estado));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await svc.eliminarReserva(p(req).id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
