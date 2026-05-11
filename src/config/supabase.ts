import { createClient } from '@supabase/supabase-js';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const envSuffix = nodeEnv === 'development' ? 'DEV' : 'PROD';

function pick(nameBase: string): string | undefined {
  return process.env[`${nameBase}_${envSuffix}`];
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

const supabaseUrl = requireEnv(`SUPABASE_URL_${envSuffix}`, pick('SUPABASE_URL'));
const supabaseKey =
  pick('SUPABASE_SERVICE_ROLE_KEY') ??
  pick('SUPABASE_ANON_KEY') ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY;

const supabase = createClient(
  supabaseUrl,
  requireEnv(
    `SUPABASE_SERVICE_ROLE_KEY_${envSuffix} (or SUPABASE_ANON_KEY_${envSuffix})`,
    supabaseKey
  )
);

export default supabase;
