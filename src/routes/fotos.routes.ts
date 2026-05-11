import { Router, Response, NextFunction } from 'express';
import authenticate, { AuthRequest } from '../middleware/auth';
import * as svc from '../services/foto.service';

const router = Router();
router.use(authenticate);

router.post('/acta', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { actaId, tipo, base64, mimetype = 'image/jpeg', ext = 'jpg' } = req.body as Record<string, string>;
    if (!actaId || !tipo || !base64) { res.status(400).json({ error: 'Faltan campos requeridos' }); return; }
    const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const url = await svc.subirFotoBuffer(actaId, tipo, buffer, mimetype, ext);
    res.status(201).json({ url });
  } catch (e) { next(e); }
});

router.post('/diagnostico', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { diagnosticoId, seccion, item, base64, mimetype = 'image/jpeg', ext = 'jpg' } = req.body as Record<string, string>;
    if (!diagnosticoId || !seccion || !base64) { res.status(400).json({ error: 'Faltan campos requeridos' }); return; }
    const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const data = await svc.subirFotoDiagnosticoBuffer(diagnosticoId, Number(seccion), item || null, buffer, mimetype, ext);
    res.status(201).json(data);
  } catch (e) { next(e); }
});

router.delete('/diagnostico', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await svc.eliminarFotoDiagnostico(req.body);
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
