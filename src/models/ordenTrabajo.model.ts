import { z } from 'zod';

const InstruccionSchema = z.object({
  id:            z.string(),
  texto:         z.string(),
  horas:         z.number().optional(),
  repuestos_ids: z.array(z.string()),
  orden:         z.number(),
  completada:    z.boolean(),
});

const PausaSchema = z.object({
  inicio: z.string(),
  fin:    z.string().nullable().optional(),
  estado: z.enum(['pendiente', 'autorizada', 'rechazada']),
});

export const OTUpdateSchema = z.object({
  status: z.enum(['generada', 'asignada', 'en_proceso', 'en_revision', 'finalizada', 'entregada']).optional(),
  pausas:           z.array(PausaSchema).optional(),
  tecnico_id:       z.string().uuid().optional().nullable(),
  tecnico_nombre:   z.string().optional().nullable(),
  items:            z.array(z.record(z.string(), z.unknown())).optional(),
  repuestos:        z.array(z.record(z.string(), z.unknown())).optional(),
  instrucciones:    z.array(InstruccionSchema).optional(),
  observaciones:    z.string().optional().nullable(),
  notas_torre:      z.string().optional().nullable(),
  nota_historial:   z.string().optional(),
  km_ingreso:       z.number().int().nullable().optional(),
  inicio_servicio:  z.string().nullable().optional(),
  termino_servicio: z.string().nullable().optional(),
});

export type OTUpdate = z.infer<typeof OTUpdateSchema>;
export type Instruccion = z.infer<typeof InstruccionSchema>;
