-- Tabla del informe de inspección (formato precompra), 1 informe por OT.
-- Correr una vez en el SQL editor de Supabase.

create table if not exists public.informes (
  id           uuid primary key default gen_random_uuid(),
  ot_id        uuid not null unique references public.ordenes_trabajo (id) on delete cascade,
  vehiculo_id  uuid,
  cliente_id   uuid,
  share_token  text not null unique,         -- token del link público
  status       text not null default 'borrador',  -- 'borrador' | 'finalizado'
  datos        jsonb not null default '{}'::jsonb, -- todos los campos del formulario
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Búsqueda rápida por OT y por token del link.
create index if not exists informes_ot_id_idx on public.informes (ot_id);
create index if not exists informes_share_token_idx on public.informes (share_token);
