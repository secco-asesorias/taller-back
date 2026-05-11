import { z } from 'zod';

const TIPOS_ITEM = ['repuesto', 'servicio', 'trabajo', 'mano_obra'] as const;
const URGENCIAS = ['necesario', 'recomendado', 'opcional'] as const;

function toLowerEnumInput(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  const s = val.trim().toLowerCase();
  return s === '' ? undefined : s;
}

const tipoItemSchema = z.preprocess(toLowerEnumInput, z.enum(TIPOS_ITEM));
const urgenciaItemSchema = z.preprocess(
  toLowerEnumInput,
  z.enum(URGENCIAS).default('recomendado'),
);

export const ItemCotizacionSchema = z.object({
  tipo: tipoItemSchema,
  descripcion: z.string().min(1),
  cantidad: z.number().min(1).default(1),
  costo_unitario: z.number().min(0).default(0),
  precio_unitario: z.number().min(0).default(0),
  mano_obra: z.number().min(0).default(0),
  urgencia: urgenciaItemSchema,
  observacion: z.string().optional().nullable(),
});

export const CotizacionUpdateSchema = z.object({
  items: z.array(ItemCotizacionSchema).optional(),
  status: z.enum(['borrador', 'lista', 'enviada', 'aprobada', 'rechazada']).optional(),
  notas: z.string().optional().nullable(),
  notas_internas: z.string().optional().nullable(),
  vista_cliente: z.record(z.string(), z.unknown()).optional(),
  descuento: z.number().min(0).optional(),
  tipo_presupuesto: z.enum(['inicial', 'final']).optional(),
  /** Vincular una cotización existente a un acta (p. ej. desde el paso «Trabajo solicitado»). */
  acta_id: z.string().uuid().nullable().optional(),
});

export type ItemCotizacion = z.infer<typeof ItemCotizacionSchema>;
export type CotizacionUpdate = z.infer<typeof CotizacionUpdateSchema>;
