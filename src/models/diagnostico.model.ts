import { z } from 'zod';

export const ChecklistItemSchema = z.object({
  seccion: z.number().int().min(1).max(9),
  item: z.string(),
  estado: z.enum(['ok', 'requiere_atencion', 'urgente', 'no_aplica']).default('ok'),
  observacion: z.string().optional().nullable(),
});

export const RepuestoSchema = z.object({
  nombre: z.string().min(1),
  cantidad: z.number().int().min(1).default(1),
  es_base: z.boolean().default(false),
  urgencia: z.enum(['necesario', 'recomendado', 'opcional']).default('recomendado'),
  observacion: z.string().optional().nullable(),
});

export const DiagnosticoUpdateSchema = z.object({
  status: z.enum(['pendiente', 'proceso', 'listo', 'cerrado']).optional(),
  tipo_mantencion: z.enum(['basica', 'intermedia', 'full']).optional().nullable(),
  horas_estimadas: z.number().min(0).optional().nullable(),
  observaciones_generales: z.string().optional().nullable(),
  fecha_inicio: z.string().optional().nullable(),
  fecha_cierre: z.string().optional().nullable(),
});

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type Repuesto = z.infer<typeof RepuestoSchema>;
export type DiagnosticoUpdate = z.infer<typeof DiagnosticoUpdateSchema>;
