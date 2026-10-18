import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildSolverWorkbook } from '../server/routes/export';
import { GUIDE_SCENARIOS } from '../engine/scenarios';

describe('Excel Solver export', () => {
  it('writes formulas and an Expected objective equal to its assignment costs', async () => {
    const scenario = GUIDE_SCENARIOS[0];
    const workbook = await buildSolverWorkbook({
      units: scenario.units,
      calls: scenario.calls,
      zones: scenario.zones,
      edges: scenario.edges,
      config: scenario.config,
    }, 'Weighted');
    const contents = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(contents);

    expect(reopened.worksheets.map((sheet) => sheet.name)).toEqual(['Model', 'Expected', 'Data']);
    const model = reopened.getWorksheet('Model');
    const expected = reopened.getWorksheet('Expected');
    expect(model?.getCell('B2').value).toMatchObject({ formula: expect.stringContaining('SUMPRODUCT') });
    expect(expected?.getCell('B2').value).toMatchObject({ formula: expect.stringContaining('SUMPRODUCT') });

    if (!expected) throw new Error('Expected worksheet missing');
    const availableUnits = scenario.units.filter((unit) => unit.status === 'Available').sort((left, right) => left.id.localeCompare(right.id));
    const pendingCalls = scenario.calls.filter((call) => call.status === 'Pending').sort((left, right) => left.id.localeCompare(right.id));
    let costTitleRow = 0;
    let decisionTitleRow = 0;
    expected.eachRow((row, rowNumber) => {
      const label = String(row.getCell(1).value ?? '');
      if (label.startsWith('Objective costs')) costTitleRow = rowNumber;
      if (label.startsWith('AURA expected binary assignment')) decisionTitleRow = rowNumber;
    });
    expect(costTitleRow).toBeGreaterThan(0);
    expect(decisionTitleRow).toBeGreaterThan(0);

    const costStart = costTitleRow + 2;
    const decisionStart = decisionTitleRow + 2;
    let recomputed = 0;
    availableUnits.forEach((_unit, unitIndex) => {
      pendingCalls.forEach((_call, callIndex) => {
        recomputed += Number(expected.getCell(costStart + unitIndex, callIndex + 2).value ?? 0)
          * Number(expected.getCell(decisionStart + unitIndex, callIndex + 2).value ?? 0);
      });
    });
    const queueCostRow = costStart + availableUnits.length;
    const queueDecisionRow = decisionStart + availableUnits.length;
    pendingCalls.forEach((_call, callIndex) => {
      recomputed += Number(expected.getCell(queueCostRow, callIndex + 2).value ?? 0)
        * Number(expected.getCell(queueDecisionRow, callIndex + 2).value ?? 0);
    });
    expect(recomputed).toBeCloseTo(Number(expected.getCell('C2').value), 6);
    expect(expected.getCell('D2').value).toEqual(expect.any(Number));
  });
});