import { Router } from 'express';
import { postSchemas, validateBody } from '../services/http';
import { getServiceTimeMin, getSimSpeed, setSimSpeed } from '../services/simClock';

export const simRouter = Router();

simRouter.get('/sim', (_request, response) => response.json({
  speed: getSimSpeed(),
  serviceTimeMin: getServiceTimeMin(),
  unit: 'sim-minutes per real-second',
}));

simRouter.post('/sim', validateBody(postSchemas.sim), (request, response) => {
  const { speed } = request.body as { speed: number };
  setSimSpeed(speed);
  return response.json({ ok: true, speed: getSimSpeed() });
});

