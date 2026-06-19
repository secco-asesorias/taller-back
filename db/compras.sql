-- Compras de repuestos: se crea una al aprobar un presupuesto con repuestos.
-- items: [{ descripcion, cantidad, costo, comprado: bool }]
-- Correr una vez en el SQL editor de Supabase.

create table if not exists public.compras (
  id                uuid primary key default gen_random_uuid(),
  cotizacion_id     uuid not null unique references public.cotizaciones (id) on delete cascade,
  ot_id             uuid,
  estado            text not null default 'pendiente',  -- 'pendiente' | 'completada'
  items             jsonb not null default '[]'::jsonb,
  numero_cotizacion integer,
  patente           text,
  vehiculo          text,
  cliente           text,
  created_at        timestamptz not null default now(),
  completada_at     timestamptz,
  completada_por    uuid
);

create index if not exists compras_estado_idx on public.compras (estado);
