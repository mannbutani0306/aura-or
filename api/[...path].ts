import { createApp } from '../server/app';
import type { Request, Response } from 'express';

export const app = createApp({ startSimulationClock: false });

export default function handler(request: Request, response: Response): void {
  app(request, response);
}
