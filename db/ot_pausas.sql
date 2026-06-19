-- Pausas de la OT (mecánico pausa/resume, con autorización del TC).
-- Cada elemento del array: { inicio: ISO, fin: ISO|null, estado: 'pendiente'|'autorizada'|'rechazada' }
-- Correr una vez en el SQL editor de Supabase.

alter table public.ordenes_trabajo
  add column if not exists pausas jsonb not null default '[]'::jsonb;
