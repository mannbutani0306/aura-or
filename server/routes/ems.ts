import { Router } from 'express';
import { asyncHandler } from '../services/http';
import { getEmsSampleRows } from '../services/emsSample';
import { supabase } from '../services/supabase';

export const emsRouter = Router();

emsRouter.get('/ems-sample', asyncHandler(async (_request, response) => {
  let warning: string | null = null;
  if (supabase) {
    try {
      const { data, error } = await supabase.from('ems_cases').select('*');
      if (error) warning = `ems_cases: ${error.message}`;
      else if (data?.length) return response.json({ source: 'database', cases: data, warning: null });
      else warning = 'ems_cases returned no sample rows';
    } catch (reason: unknown) {
      warning = reason instanceof Error ? reason.message : 'Unable to read the EMS sample table';
    }
  }
  const cases = await getEmsSampleRows();
  return response.json({
    source: 'workbook',
    cases,
    warning: warning ? `Supabase sample unavailable (${warning}); showing the provided workbook sample.` : null,
  });
}));
