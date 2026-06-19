import { Router, Request, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import requireRole from '../middleware/roleGuard';
import { InformeUpdateSchema } from '../models/informe.model';
import * as svc from '../services/informe.service';

const router = Router();
const p = (req: AuthRequest) => req.params as Record<string, string>;

// ── Visor público (sin auth) — DEBE ir antes de router.use(authenticate) ──────
router.get('/public/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.obtenerInformePublico((req.params as Record<string, string>).token));
  } catch (e) { next(e); }
});

// ── A partir de aquí, todo requiere sesión ───────────────────────────────────
router.use(authenticate);

// Listado de todos los informes (vista de Informes para admin/recepción).
router.get('/', requireRole('admin', 'recepcionista'), async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.listarInformes());
  } catch (e) { next(e); }
});

// Crear (o devolver) el informe de una OT
router.post('/desde-ot/:otId', requireRole('admin', 'tecnico'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await svc.crearOInformeDesdeOT(p(req).otId));
  } catch (e) { next(e); }
});

router.get('/por-ot/:otId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.obtenerInformePorOT(p(req).otId));
  } catch (e) { next(e); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.obtenerInformePorId(p(req).id));
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('admin', 'tecnico'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = InformeUpdateSchema.parse(req.body);
    res.json(await svc.actualizarInforme(p(req).id, datos));
  } catch (e) { next(e); }
});

router.patch('/:id/finalizar', requireRole('admin', 'tecnico'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.finalizarInforme(p(req).id));
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.eliminarInforme(p(req).id));
  } catch (e) { next(e); }
});

export default router;
