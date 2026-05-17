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

const supabaseUrl = requireEnv(`SUPABASE_URL_${envSuffix} (or SUPABASE_URL)`, pick('SUPABASE_URL'));
const serviceRoleKey = requireEnv(
  `SUPABASE_SERVICE_ROLE_KEY_${envSuffix} (or SUPABASE_SERVICE_ROLE_KEY)`,
  pick('SUPABASE_SERVICE_ROLE_KEY'),
);

/** Cliente con service role: Auth Admin y operaciones privilegiadas (solo servidor). */
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default supabaseAdmin;
