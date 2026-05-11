import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const envSuffix = nodeEnv === 'development' ? 'DEV' : 'PROD';

function pick(nameBase: string): string | undefined {
  return process.env[`${nameBase}_${envSuffix}`] ?? process.env[nameBase];
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

const supabaseAnon = createClient(
  requireEnv(`SUPABASE_URL_${envSuffix} (or SUPABASE_URL)`, pick('SUPABASE_URL')),
  requireEnv(`SUPABASE_ANON_KEY_${envSuffix} (or SUPABASE_ANON_KEY)`, pick('SUPABASE_ANON_KEY'))
);

export interface AuthRequest extends Request {
  user?: { id: string; email?: string };
  token?: string;
  perfil?: { rol: string };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token no proporcionado' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAnon.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Token inválido o expirado' });
    return;
  }

  req.user = { id: user.id, email: user.email };
  req.token = token;
  next();
}

export default authenticate;
