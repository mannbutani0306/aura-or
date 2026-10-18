import { Router } from 'express';
import { runMonteCarloEvaluation, ensureTriageMix, TriageMix } from '../../engine/evaluate';
import { asyncHandler, HttpError } from '../services/http';
import { supabase } from '../services/supabase';

export const evaluateRouter = Router();

function clampScenarioCount(value: unknown): number {
  const next = Number(value ?? 500);
  if (!Number.isFinite(next)) return 500;
  return Math.min(2000, Math.max(1, Math.round(next)));
}

async function readTriageMixFromDatabase(): Promise<TriageMix> {
  if (!supabase) return { Critical: 40, High: 30, Medium: 20, Low: 10 };
  try {
    const { data, error } = await supabase.from('ems_cases').select('priority').limit(2000);
    if (error || !Array.isArray(data)) return { Critical: 40, High: 30, Medium: 20, Low: 10 };
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    for (const row of data) {
      const priority = String((row as { priority?: string })?.priority ?? 'Medium');
      if (priority in counts) {
        counts[priority as keyof typeof counts] += 1;
      }
    }
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
    return {
      Critical: (counts.Critical / total) * 100,
      High: (counts.High / total) * 100,
      Medium: (counts.Medium / total) * 100,
      Low: (counts.Low / total) * 100,
    };
  } catch {
    return { Critical: 40, High: 30, Medium: 20, Low: 10 };
  }
}

evaluateRouter.post('/evaluate', asyncHandler(async (request, response) => {
  const body = request.body ?? {};
  const requestedN = clampScenarioCount(body.n ?? 500);
  const seed = Number(body.seed ?? 1337);
  const triageMix = ensureTriageMix(body.triageMix ?? (await readTriageMixFromDatabase()));

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
      if (!error && data?.id) {
        const rows = summary.scenarios.map((item, index) => ({
          run_id: data.id,
          idx: index,
          n_amb: item.fcfs.served + item.greedy.served + item.optimal.served,
          n_em: 0,
          fcfs: item.fcfs,
          greedy: item.greedy,
          optimal: item.optimal,
        }));
        await supabase.from('eval_scenarios').insert(rows);
      }
    } catch {
      // Persist best-effort only when database is available.
    }
  }

  response.write(`event: complete\ndata: ${JSON.stringify(summary)}\n\n`);
  response.end();
}));

evaluateRouter.get('/evaluate', asyncHandler(async (_request, response) => {
  response.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST /api/evaluate' } });
}));
