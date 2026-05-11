import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Datos inválidos',
      detalles: err.issues.map(e => ({ campo: e.path.map(String).join('.'), mensaje: e.message })),
    });
    return;
  }

  const e = err as { status?: number; message?: string };
  console.error(err);
  res.status(e.status || 500).json({ error: e.message || 'Error interno del servidor' });
}

export default errorHandler;
