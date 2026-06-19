import { z } from 'zod';

/**
 * El informe de inspección guarda todos los campos del formulario con sus claves crudas
 * (ej. `mec_estadoMotor`, `interior_sunroof`, `mec_imagenes: [url...]`) dentro de `datos`.
 * No validamos campo por campo (son ~120 y evolucionan); validamos el contenedor.
 */
export const InformeUpdateSchema = z.object({
  datos: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['borrador', 'finalizado']).optional(),
});

export type InformeUpdate = z.infer<typeof InformeUpdateSchema>;
