import { z } from 'zod';

export const ActaEntregaCreateSchema = z.object({
  vehiculo_id: z.string().uuid(),
  cliente_id: z.string().uuid(),
  fecha_ingreso: z.string().optional().nullable(),
  fecha_entrega: z.string(),
  hora_entrega: z.string().optional().nullable(),
  km: z.number().min(0).optional().default(0),
  combustible: z.string().optional().default('pendiente'),
});

export const ActaEntregaUpdateSchema = z.object({
  km: z.number().min(0).optional(),
  combustible: z.string().optional(),
  llaves: z.union([z.boolean(), z.number().int().min(0)]).optional(),
  documentacion: z.array(z.string()).optional(),
  estado_exterior: z.string().optional(),
  detalle_exterior: z.string().optional(),
  estado_interior: z.string().optional(),
  detalle_interior: z.string().optional(),
  trabajo_solicitado: z.string().optional(),
  acepta_declaracion: z.boolean().optional(),
  acepta_responsabilidad_objetos: z.boolean().optional(),
  acepta_pruebas_ruta: z.boolean().optional(),
  firma_cliente_url: z.string().url().optional().nullable(),
  firma_secco_url: z.string().url().optional().nullable(),
  tecnico_nombre: z.string().optional().nullable(),
  tc_nombre: z.string().optional().nullable(),
  checklist_completo: z.boolean().optional(),
  fecha_ingreso: z.string().optional().nullable(),
  fecha_entrega: z.string().optional(),
  hora_entrega: z.string().optional().nullable(),
  status: z.enum(['borrador', 'cerrada']).optional(),
});

export type ActaEntregaCreate = z.infer<typeof ActaEntregaCreateSchema>;
export type ActaEntregaUpdate = z.infer<typeof ActaEntregaUpdateSchema>;
