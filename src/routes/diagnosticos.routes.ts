import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import authenticate, { AuthRequest } from '../middleware/auth';
import requireRole from '../middleware/roleGuard';
import { DiagnosticoUpdateSchema, ChecklistItemSchema, RepuestoSchema } from '../models/diagnostico.model';
import * as svc from '../services/diagnostico.service';

const router = Router();
router.use(authenticate);
const p = (req: AuthRequest) => req.params as Record<string, string>;

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { limite, status } = req.query as Record<string, string>;
    res.json(await svc.listarDiagnosticos(Number(limite) || 30, status));
  } catch (e) { next(e); }
});

/** Diagnósticos por patente (parcial). Por defecto todos los status hasta limite. Query: limite, status, soloActivos. */
router.get('/buscar/patente/:patente', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { limite, status, soloActivos } = req.query as Record<string, string>;
    const soloActivosFlag = soloActivos === '1' || soloActivos === 'true';
    res.json(await svc.buscarDiagnosticoPorPatente(p(req).patente, {
      limite: Number(limite) || 30,
      status: status || undefined,
      soloActivos: soloActivosFlag,
    }));
  } catch (e) { next(e); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.cargarDiagnosticoCompleto(p(req).id));
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'recepcionista'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { acta_id, patente } = req.body as { acta_id?: string; patente?: string };
    if (!acta_id) { res.status(400).json({ error: 'acta_id requerido' }); return; }
    res.status(201).json(await svc.crearDiagnostico(acta_id, patente || ''));
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('admin', 'tecnico'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const datos = DiagnosticoUpdateSchema.parse(req.body);
    res.json(await svc.actualizarDiagnostico(p(req).id, datos));
  } catch (e) { next(e); }
});

router.put('/:id/checklist', requireRole('admin', 'tecnico'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const items = z.array(ChecklistItemSchema).parse(req.body.items);
    res.json(await svc.guardarChecklist(p(req).id, items));
  } catch (e) { next(e); }
});

router.put('/:id/repuestos', requireRole('admin', 'tecnico'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const repuestos = z.array(RepuestoSchema).parse(req.body.repuestos);
    res.json(await svc.guardarRepuestos(p(req).id, repuestos));
  } catch (e) { next(e); }
});

export default router;
