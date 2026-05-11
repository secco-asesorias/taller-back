import { z } from 'zod';

export const OTUpdateSchema = z.object({
  status: z.enum(['generada', 'asignada', 'en_proceso', 'finalizada', 'entregada']).optional(),
  tecnico_id: z.string().uuid().optional().nullable(),
  tecnico_nombre: z.string().optional().nullable(),
  items: z.array(z.record(z.string(), z.unknown())).optional(),
  repuestos: z.array(z.record(z.string(), z.unknown())).optional(),
  instrucciones: z.array(z.record(z.string(), z.unknown())).optional(),
  observaciones: z.string().optional().nullable(),
  nota_historial: z.string().optional(),
});

export type OTUpdate = z.infer<typeof OTUpdateSchema>;
