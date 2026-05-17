import { z } from 'zod';

/** Roles de personal del taller (no incluye clientes de la tabla `clientes`). */
export const ROLES_PERSONAL = ['admin', 'recepcionista', 'tecnico'] as const;
export type RolPersonal = (typeof ROLES_PERSONAL)[number];

export const UsuarioCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  rol: z.enum(ROLES_PERSONAL),
  nombre: z.string().min(1).optional(),
});

export type UsuarioCreate = z.infer<typeof UsuarioCreateSchema>;
