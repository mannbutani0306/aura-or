import { createRequire } from 'node:module';
import type { Express, Request, Response } from 'express';

const require = createRequire(import.meta.url);
export const { app } = require('../.server-build/vercel-app.cjs') as { app: Express };

export default function handler(request: Request, response: Response): void {
  app(request, response);
}
