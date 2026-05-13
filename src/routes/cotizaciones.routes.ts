import { Router, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import requireRole from '../middleware/roleGuard';
import { CotizacionUpdateSchema } from '../models/cotizacion.model';
import * as svc from '../services/cotizacion.service';
import * as pdfSvc from '../services/cotizacionPdf.service';
import * as otSvc from '../services/ordenTrabajo.service';
import supabase from '../config/supabase';

const router = Router();
router.use(authenticate);
const p = (req: AuthRequest) => req.params as Record<string, string>;

/** Express puede devolver string | string[]; sin esto el filtro `status` a veces no aplica. */
function queryPrimero(v: unknown): string | undefined {
  if (v == null) return undefined;
  const primero = Array.isArray(v) ? v[0] : v;
  if (typeof primero !== 'string') return undefined;
  const t = primero.trim();
  return t.length ? t : undefined;
}

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.listarCotizaciones(Number(req.query.limite) || 30));
  } catch (e) { next(e); }
});

/** Cotizaciones por patente (parcial). Query: limite; status (cotización o diagnóstico: listo, proceso…); diagnostico_status. */
router.get('/buscar/patente/:patente', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limiteRaw = queryPrimero(req.query.limite);
    const status = queryPrimero(req.query.status);
    const diagnostico_status = queryPrimero(req.query.diagnostico_status);
    res.json(await svc.buscarCotizacionesPorPatente(p(req).patente, {
      limite: Number(limiteRaw) || 30,
      status,
      diagnostico_status,
    }));
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

/** PDF desde `presupuestos.html` + Handlebars; el body puede traer cliente, vehiculo, items, resumen, fecha, etc. */
router.post('/:id/pdf', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = p(req).id;
    const row = (await svc.cargarCotizacionCompleta(id)) as Record<string, unknown>;
    const body =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const ctx = pdfSvc.mergePresupuestoFromBodyAndRow(body, row);
    const buffer = await pdfSvc.generarPdfPresupuesto(ctx);
    const slug =
      (ctx.vehiculo.patente && ctx.vehiculo.patente.replace(/[^\w-]/g, '')) || id.slice(0, 8);
    const filename = `cotizacion-${slug}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
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

router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await svc.eliminarCotizacion(p(req).id));
  } catch (e) { next(e); }
});

export default router;
