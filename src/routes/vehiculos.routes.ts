import { Router, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import { VehiculoSchema } from '../models/vehiculo.model';
import * as svc from '../services/vehiculo.service';

const router = Router();
router.use(authenticate);
const p = (req: AuthRequest) => req.params as Record<string, string>;

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { search, limite } = req.query as Record<string, string>;
    res.json(await svc.listarVehiculos(Number(limite) || 50, search));
  } catch (e) { next(e); }
});

router.get('/patente/:patente', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await svc.buscarVehiculoPorPatente(p(req).patente);
    if (!data) { res.status(404).json({ error: 'Vehículo no encontrado' }); return; }
    res.json(data);
  } catch (e) { next(e); }
});

router.get('/cliente/:clienteId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.listarVehiculosPorCliente(p(req).clienteId));
  } catch (e) { next(e); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.obtenerVehiculoPorId(p(req).id));
  } catch (e) { next(e); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = VehiculoSchema.parse(req.body);
    res.status(201).json(await svc.upsertVehiculo(datos));
  } catch (e) { next(e); }
});

router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = VehiculoSchema.partial().parse(req.body);
    res.json(await svc.upsertVehiculo({ id: p(req).id, ...datos }));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.eliminarVehiculo(p(req).id));
  } catch (e) { next(e); }
});

export default router;
