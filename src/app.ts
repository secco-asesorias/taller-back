import express from 'express';
import cors from 'cors';
import errorHandler from './middleware/errorHandler';

import clientesRoutes from './routes/clientes.routes';
import vehiculosRoutes from './routes/vehiculos.routes';
import actasRoutes from './routes/actas.routes';
import fotosRoutes from './routes/fotos.routes';
import diagnosticosRoutes from './routes/diagnosticos.routes';
import cotizacionesRoutes from './routes/cotizaciones.routes';
import ordenesTrabajoRoutes from './routes/ordenesTrabajo.routes';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/clientes', clientesRoutes);
app.use('/api/vehiculos', vehiculosRoutes);
app.use('/api/actas', actasRoutes);
app.use('/api/fotos', fotosRoutes);
app.use('/api/diagnosticos', diagnosticosRoutes);
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use('/api/ordenes-trabajo', ordenesTrabajoRoutes);

app.use(errorHandler);

export default app;
