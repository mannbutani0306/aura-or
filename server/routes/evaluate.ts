import { Router } from 'express';
import { DEFAULT_TRIAGE_MIX, runMonteCarloEvaluation, ensureTriageMix } from '../../engine/evaluate';
import { asyncHandler, evaluateRateLimit, HttpError } from '../services/http';
import { supabase } from '../services/supabase';

export const evaluateRouter = Router();

function clampScenarioCount(value: unknown): number {
  const next = Number(value ?? 500);
  if (!Number.isFinite(next)) return 500;
  return Math.min(2000, Math.max(1, Math.round(next)));
}

evaluateRouter.post('/evaluate', evaluateRateLimit, asyncHandler(async (request, response) => {
  const body = request.body ?? {};
  const requestedN = clampScenarioCount(body.n ?? 500);
  const seed = Number(body.seed ?? 1337);
  const triageMix = ensureTriageMix(body.triageMix ?? DEFAULT_TRIAGE_MIX);

  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders?.();

  const summary = await runMonteCarloEvaluation({
    n: requestedN,
    seed,
    triageMix,
    progress: (current, total) => {
      response.write(`event: progress\ndata: ${JSON.stringify({ current, total, percent: (current / total) * 100 })}\n\n`);
    },
  });

  if (supabase) {
    try {
      const { data, error } = await supabase.from('eval_runs').insert({
        seed,
        scenario_count: requestedN,
        mean_improvement_pct: summary.meanImprovementPct,
        p_value: summary.pValue,
        created_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw new Error(`eval_runs: ${error.message}`);
      if (!data?.id) throw new Error('eval_runs insert returned no run id');
      const rows = summary.scenarios.map((item, index) => ({
        run_id: data.id,
        idx: index,
        n_amb: item.unitCount,
        n_em: item.callCount,
        fcfs: item.fcfs,
        greedy: item.greedy,
        optimal: item.optimal,
      }));
      const scenarioInsert = await supabase.from('eval_scenarios').insert(rows);
      if (scenarioInsert.error) throw new Error(`eval_scenarios: ${scenarioInsert.error.message}`);
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : 'Evaluation persistence failed';
      response.write(`event: error\ndata: ${JSON.stringify({ error: { code: 'EVALUATION_PERSIST_FAILED', message } })}\n\n`);
      response.end();
      return;
    }
  }

  response.write(`event: complete\ndata: ${JSON.stringify(summary)}\n\n`);
  response.end();
}));

evaluateRouter.get('/evaluate', asyncHandler(async (_request, response) => {
  response.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST /api/evaluate' } });
}));
