import { z } from 'zod';

export const HorarioSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Formato de hora inválido'),
  hora_fin: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Formato de hora inválido'),
  cupos_disponibles: z.number().int().min(1).max(20).default(1),
  activo: z.boolean().default(true),
});

export type Horario = z.infer<typeof HorarioSchema>;
