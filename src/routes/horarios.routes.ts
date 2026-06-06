import { Router, Request, Response, NextFunction } from 'express';
import * as svc from '../services/horario.service';

const router = Router();

router.get('/disponibles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fecha } = req.query as Record<string, string>;
    if (!fecha) { res.status(400).json({ error: 'Se requiere el parámetro fecha (YYYY-MM-DD)' }); return; }
    res.json(await svc.listarHorariosDisponibles(fecha));
  } catch (e) { next(e); }
});

export default router;
