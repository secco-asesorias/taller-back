import { z } from 'zod';

const rutChileno = z.string()
  .min(7).max(12)
  .regex(/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$|^\d{7,8}-[\dkK]$/, 'Formato de RUT inválido');

export const ClienteSchema = z.object({
  nombre: z.string().min(2, 'Nombre requerido'),
  rut: rutChileno,
  telefono: z.string().min(8).max(12).optional().nullable(),
  email: z.string().email('Email inválido').optional().nullable(),
});

export type Cliente = z.infer<typeof ClienteSchema>;
