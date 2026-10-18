import compression from 'compression';
import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configRouter } from './routes/config';
import { dispatchRouter } from './routes/dispatch';
import { evaluateRouter } from './routes/evaluate';
import { exportRouter } from './routes/export';
import { healthRouter } from './routes/health';
import { pulseManager, pulseRouter } from './routes/pulse';
import { routeRouter } from './routes/route';
import { simRouter } from './routes/sim';
import { solveRouter } from './routes/solve';
import { stateRouter } from './routes/state';
import { errorHandler, HttpError } from './services/http';
import { startSimulationClock, stopSimulationClock } from './services/simClock';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createApp(): Express {
  const app = express();
  const appUrl = process.env.APP_URL?.trim();
  const appOrigin = appUrl ? new URL(appUrl).origin : undefined;
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", 'https:', 'wss:'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || (appOrigin !== undefined && origin === appOrigin)),
    credentials: false,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb', parameterLimit: 1000 }));
  app.use(compression());

  app.use('/api', healthRouter);
  app.use('/api', configRouter);
  app.use('/api', evaluateRouter);
  app.use('/api', exportRouter);
  app.use('/api', solveRouter);
  app.use('/api', routeRouter);
  app.use('/api', simRouter);
  app.use('/api', pulseRouter);
  app.use('/api', dispatchRouter);
  app.use('/api', stateRouter);
  app.use('/api', (_request: Request, _response: Response, next) => {
    next(new HttpError(404, 'NOT_FOUND', 'API endpoint not found'));
  });
  app.use(errorHandler);
  startSimulationClock();
  return app;
}

export async function startServer(): Promise<void> {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(currentDirectory, '../dist');
    app.use(express.static(distPath, {
      setHeaders: (response, assetPath) => {
        if (assetPath.includes(`${path.sep}assets${path.sep}`)) {
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (assetPath.endsWith(`${path.sep}index.html`)) {
          response.setHeader('Cache-Control', 'no-cache');
        }
      },
    }));
    app.get('*', (_request, response) => response.sendFile(path.join(distPath, 'index.html')));
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`AURA Server running on http://0.0.0.0:${port} [${isProduction ? 'production' : 'development'}]`);
  });
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    pulseManager.stop();
    stopSimulationClock();
    server.close((error) => {
      if (error) {
        console.error('Graceful shutdown failed:', error.message);
        process.exitCode = 1;
      }
    });
    server.closeIdleConnections();
    const shutdownTimer = setTimeout(() => server.closeAllConnections(), 10_000);
    shutdownTimer.unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}