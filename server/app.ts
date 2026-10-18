import compression from 'compression';
import express, { Express, Request, Response } from 'express';
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
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
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
  const shutdown = () => {
    pulseManager.stop();
    stopSimulationClock();
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}