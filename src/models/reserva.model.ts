import { z } from 'zod';

const rutChileno = z.string()
  .regex(/^\d{7,8}-[\dkK]$/, 'Formato de RUT inválido (ej: 12345678-9)');

const HORAS_VALIDAS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'] as const;

export const ReservaSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  hora_inicio: z.enum(HORAS_VALIDAS, { error: 'Hora no válida' }),
  nombre: z.string().min(2, 'Nombre requerido'),
  telefono: z.string().min(8).max(15),
  email: z.string().email('Email inválido').optional().nullable(),
  rut: rutChileno,
  patente: z.string().max(10).optional().nullable(),
  marca_modelo: z.string().max(100).optional().nullable(),
  año: z.string().regex(/^\d{4}$/, 'Año inválido').optional().nullable(),
  vin: z.string().max(17).optional().nullable(),
  km: z.coerce.number().int().nonnegative().optional().nullable(),
  trabajo_solicitado: z.string().min(5, 'Describe el trabajo solicitado'),
});

export const EstadoReservaSchema = z.object({
  estado: z.enum(['pendiente', 'confirmada', 'cancelada']),
});

export type Reserva = z.infer<typeof ReservaSchema>;
