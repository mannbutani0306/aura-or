export async function downloadSolverWorkbook(mode: 'Weighted' | 'Plain'): Promise<void> {
  const response = await fetch(`/api/export/solver.xlsx?mode=${mode.toLowerCase()}`);
  if (!response.ok) {
    let message = `Solver export failed (${response.status})`;
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object') {
        const error = (payload as Record<string, unknown>).error;
        if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
          message = String((error as Record<string, unknown>).message);
        }
      }
    } catch {
      message = `Solver export failed (${response.status})`;
    }
    throw new Error(message);
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `aura-solver-${mode.toLowerCase()}.xlsx`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}