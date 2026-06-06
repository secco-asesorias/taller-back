import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import errorHandler from './middleware/errorHandler';

import clientesRoutes from './routes/clientes.routes';
import vehiculosRoutes from './routes/vehiculos.routes';
import actasRoutes from './routes/actas.routes';
import actasEntregaRoutes from './routes/actasEntrega.routes';
import fotosRoutes from './routes/fotos.routes';
import diagnosticosRoutes from './routes/diagnosticos.routes';
import cotizacionesRoutes from './routes/cotizaciones.routes';
import ordenesTrabajoRoutes from './routes/ordenesTrabajo.routes';
import usuariosRoutes from './routes/usuarios.routes';
import tecnicosRoutes from './routes/tecnicos.routes';
import horariosRoutes from './routes/horarios.routes';
import reservasRoutes from './routes/reservas.routes';

const app = express();

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
app.use('/api/', limiter);

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/clientes', clientesRoutes);
app.use('/api/vehiculos', vehiculosRoutes);
app.use('/api/actas', actasRoutes);
app.use('/api/actas-entrega', actasEntregaRoutes);
app.use('/api/fotos', fotosRoutes);
app.use('/api/diagnosticos', diagnosticosRoutes);
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use('/api/ordenes-trabajo', ordenesTrabajoRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/tecnicos', tecnicosRoutes);
app.use('/api/horarios', horariosRoutes);
app.use('/api/reservas', reservasRoutes);

app.use(errorHandler);

export default app;
