import { Router, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import requireRole from '../middleware/roleGuard';
import { CotizacionUpdateSchema } from '../models/cotizacion.model';
import * as svc from '../services/cotizacion.service';
import * as otSvc from '../services/ordenTrabajo.service';
import supabase from '../config/supabase';

const router = Router();
router.use(authenticate);
const p = (req: AuthRequest) => req.params as Record<string, string>;

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.listarCotizaciones(Number(req.query.limite) || 30));
  } catch (e) { next(e); }
});

router.post('/desde-acta/:actaId', requireRole('admin', 'recepcionista'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await svc.crearCotizacionInicialDesdeActa(p(req).actaId));
  } catch (e) { next(e); }
});

router.post('/borrador', requireRole('admin', 'recepcionista'), async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await svc.crearCotizacionBorradorLibre());
  } catch (e) { next(e); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.cargarCotizacionCompleta(p(req).id));
  } catch (e) { next(e); }
});

router.post('/desde-diagnostico/:diagnosticoId', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await svc.crearCotizacionDesdeDiagnostico(p(req).diagnosticoId));
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('admin', 'recepcionista'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = CotizacionUpdateSchema.parse(req.body);
    res.json(await svc.actualizarCotizacion(p(req).id, datos));
  } catch (e) { next(e); }
});

router.patch('/:id/aprobar', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await otSvc.aprobarCotizacionYCrearOT(p(req).id));
  } catch (e) { next(e); }
});

router.patch('/:id/rechazar', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { motivo } = req.body as { motivo?: string };
    const { error } = await supabase
      .from('cotizaciones')
      .update({ status: 'rechazada', motivo_rechazo: motivo || '', updated_at: new Date().toISOString() })
      .eq('id', p(req).id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
