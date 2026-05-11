import { z } from 'zod';

export const VehiculoSchema = z.object({
  cliente_id: z.string().uuid('cliente_id inválido'),
  marca: z.string().min(1, 'Marca requerida'),
  modelo: z.string().min(1, 'Modelo requerido'),
  anio: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  patente: z.string().min(4).max(10).transform(v => v.toUpperCase()),
  vin: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
});

export type Vehiculo = z.infer<typeof VehiculoSchema>;
