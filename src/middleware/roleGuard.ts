import { Response, NextFunction } from 'express';
import supabase from '../config/supabase';
import { AuthRequest } from './auth';

function requireRole(...roles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const { data: perfil, error } = await supabase
      .from('perfiles')
      .select('rol')
      .eq('id', req.user!.id)
      .single();

    if (error || !perfil) {
      res.status(403).json({ error: 'Perfil no encontrado' });
      return;
    }

    if (!roles.includes(perfil.rol)) {
      res.status(403).json({ error: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}` });
      return;
    }

    req.perfil = perfil;
    next();
  };
}

export default requireRole;
