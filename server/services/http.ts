import { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z, ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const emptyBodySchema = z.object({}).strict();
const dispatchItemSchema = z.object({
  emergencyId: z.string().optional(),
  emergency_id: z.string().optional(),
  ambulanceId: z.string().optional(),
  ambulance_id: z.string().optional(),
  fromZone: z.string().optional(),
  from_zone: z.string().optional(),
  toZone: z.string().optional(),
  to_zone: z.string().optional(),
  etaMin: z.number().finite().nonnegative().optional(),
  eta_min: z.number().finite().nonnegative().optional(),
  benchmarkMin: z.number().finite().positive().optional(),
  benchmark_min: z.number().finite().positive().optional(),
  path: z.array(z.string()).optional(),
}).passthrough().superRefine((item, context) => {
  if (!item.emergencyId && !item.emergency_id) context.addIssue({ code: 'custom', message: 'emergencyId is required' });
  if (!item.ambulanceId && !item.ambulance_id) context.addIssue({ code: 'custom', message: 'ambulanceId is required' });
  if (item.etaMin === undefined && item.eta_min === undefined) context.addIssue({ code: 'custom', message: 'etaMin is required' });
});

export const postSchemas = {
  solve: z.object({
    mode: z.enum(['weighted', 'plain', 'Weighted', 'Plain']).optional(),
    persist: z.boolean().optional(),
  }).strict(),
  solveAdhoc: z.object({
    units: z.array(z.record(z.string(), z.unknown())).optional(),
    calls: z.array(z.record(z.string(), z.unknown())).optional(),
    zones: z.array(z.record(z.string(), z.unknown())).optional(),
    edges: z.array(z.record(z.string(), z.unknown())).optional(),
    config: z.object({
      sla_min: z.number().finite().positive().optional(),
      als_policy: z.enum(['hard', 'penalty', 'off']).optional(),
      als_penalty_min: z.number().finite().nonnegative().optional(),
      unserved_min: z.number().finite().positive().optional(),
      max_response_min: z.number().finite().positive().nullable().optional(),
      service_min: z.number().finite().positive().optional(),
    }).strict().optional(),
    mode: z.enum(['weighted', 'plain', 'Weighted', 'Plain']).optional(),
    matrixOverride: z.unknown().optional(),
  }).strict(),
  config: z.object({
    sla_min: z.number().finite().positive(),
    als_policy: z.enum(['hard', 'penalty', 'off']),
    als_penalty_min: z.number().finite().nonnegative(),
    unserved_min: z.number().finite().positive(),
    max_response_min: z.number().finite().positive().nullable(),
    service_min: z.number().finite().positive(),
  }).strict(),
  sim: z.object({ speed: z.coerce.number().refine((value) => [1, 2, 5, 10].includes(value)) }).strict(),
  pulse: z.object({
    running: z.boolean(),
    ratePerHour: z.number().finite().min(1).max(120).optional(),
    zoneWeights: z.record(z.string(), z.number().finite().nonnegative()).nullable().optional(),
  }).strict(),
  dispatch: z.object({
    items: z.array(dispatchItemSchema).min(1),
    runId: z.string().nullable().optional(),
  }).strict(),
  advance: z.object({ status: z.enum(['OnScene', 'Completed']) }).strict(),
  cancel: emptyBodySchema,
  emergency: z.object({
    zoneId: z.string().min(1).default('B'),
    priority: z.enum(['Critical', 'High', 'Medium', 'Low']).default('Critical'),
    requiresAls: z.boolean().optional(),
    source: z.string().optional(),
  }).strict(),
  reset: emptyBodySchema,
} satisfies Record<string, ZodType>;

export function validateBody(schema: ZodType): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    const result = schema.safeParse(request.body ?? {});
    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join('; ');
      return next(new HttpError(400, 'VALIDATION_ERROR', message));
    }
    request.body = result.data;
    return next();
  };
}

export function asyncHandler(handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (request, response, next) => {
    void handler(request, response, next).catch(next);
  };
}

export const evaluateRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Evaluation request limit reached. Try again later.' } },
});

export const pulseRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Pulse request limit reached. Try again later.' } },
});

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    response.end();
    return;
  }
  if (error instanceof HttpError) {
    return response.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
  }
  if (error && typeof error === 'object' && 'type' in error) {
    const parserError = error as { type?: unknown };
    if (parserError.type === 'entity.too.large') {
      return response.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 1 MB limit' } });
    }
    if (parserError.type === 'entity.parse.failed') {
      return response.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } });
    }
  }
  console.error('Unhandled API error:', error);
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : error instanceof Error ? error.message : 'Internal server error';
  return response.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
};