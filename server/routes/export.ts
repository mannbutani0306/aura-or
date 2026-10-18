import ExcelJS from 'exceljs';
import { Router } from 'express';
import { buildCostMatrix, solveFleetAllocation } from '../../engine/assignment';
import { buildTravelMatrix } from '../../engine/graph';
import { Ambulance, Emergency, RoadEdge, Zone } from '../../engine/types';
import { asyncHandler, HttpError } from '../services/http';
import { loadOperationalState, OperationalState } from '../services/operationalState';

export const INFEASIBLE_CELL_COST = 1_000_000;

function columnName(column: number): string {
  let remaining = column;
  let label = '';
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return label;
}

function setHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF183436' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8C21A' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF183436' } } };
  });
}

function setBox(sheet: ExcelJS.Worksheet, startRow: number, endRow: number, startCol: number, endCol: number): void {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      sheet.getCell(row, col).border = {
        top: row === startRow ? { style: 'medium', color: { argb: 'FF183436' } } : undefined,
        bottom: row === endRow ? { style: 'medium', color: { argb: 'FF183436' } } : undefined,
        left: col === startCol ? { style: 'medium', color: { argb: 'FF183436' } } : undefined,
        right: col === endCol ? { style: 'medium', color: { argb: 'FF183436' } } : undefined,
      };
    }
  }
}

function writeOptimizationSheet(
  sheet: ExcelJS.Worksheet,
  title: string,
  mode: 'Weighted' | 'Plain',
  units: Ambulance[],
  calls: Emergency[],
  zones: Zone[],
  edges: RoadEdge[],
  config: OperationalState['config'],
  isExpected: boolean,
): Promise<{ objective: number; crossCheck: number; costMatrix: ReturnType<typeof buildCostMatrix> }> {
  return solveFleetAllocation(units, calls, zones, edges, config, mode).then((solution) => {
    const availableUnits = units.filter((unit) => unit.status === 'Available').sort((left, right) => left.id.localeCompare(right.id));
    const pendingCalls = calls.filter((call) => call.status === 'Pending').sort((left, right) => left.id.localeCompare(right.id));
    const travel = buildTravelMatrix(availableUnits, pendingCalls, zones, edges);
    const costMatrix = buildCostMatrix(availableUnits, pendingCalls, travel, config, mode);
    const assignmentMap = new Map(solution.assignments.map((assignment) => [`${assignment.ambulanceId}\0${assignment.emergencyId}`, 1]));
    const queued = new Set(solution.unserved.map((item) => item.emergencyId));

    sheet.views = [{ state: 'frozen', ySplit: 4, xSplit: 1 }];
    sheet.getColumn(1).width = 28;
    for (let index = 0; index < pendingCalls.length; index += 1) sheet.getColumn(index + 2).width = 17;
    sheet.getCell('A1').value = title;
    sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF183436' } };
    sheet.getCell('A2').value = 'Objective (weighted response + unserved penalties)';
    sheet.getCell('B2').value = { formula: '0' };
    sheet.getCell('C2').value = solution.objective;
    sheet.getCell('D2').value = solution.crossCheck.value;
    sheet.getCell('C1').value = 'AURA objective';
    sheet.getCell('D1').value = 'Hungarian cross-check';
    sheet.getCell('B1').value = 'Workbook formula';
    sheet.getCell('E1').value = `Mode: ${mode}`;

    const callHeaders = pendingCalls.map((call) => call.id);
    const weightTitleRow = 4;
    sheet.getCell(weightTitleRow, 1).value = 'Emergency weights';
    sheet.getRow(weightTitleRow + 1).values = ['', ...callHeaders];
    sheet.getRow(weightTitleRow + 2).values = [
      'Weight',
      ...pendingCalls.map((call) => mode === 'Plain' ? 1 : call.weight),
    ];
    setHeader(sheet.getRow(weightTitleRow + 1));

    const travelTitleRow = 8;
    sheet.getCell(travelTitleRow, 1).value = `Travel time (min); unreachable pairs use ${INFEASIBLE_CELL_COST}`;
    sheet.getRow(travelTitleRow + 1).values = ['Unit', ...callHeaders];
    setHeader(sheet.getRow(travelTitleRow + 1));
    availableUnits.forEach((unit, unitIndex) => {
      sheet.getRow(travelTitleRow + 2 + unitIndex).values = [
        unit.id,
        ...pendingCalls.map((call) => travel.rawTimes[unit.id]?.[call.id] ?? INFEASIBLE_CELL_COST),
      ];
    });

    const costTitleRow = travelTitleRow + availableUnits.length + 4;
    const costHeaderRow = costTitleRow + 1;
    const costDataStartRow = costTitleRow + 2;
    sheet.getCell(costTitleRow, 1).value = 'Objective costs (travel + ALS policy penalty, multiplied by weight)';
    sheet.getRow(costHeaderRow).values = ['Unit', ...callHeaders];
    setHeader(sheet.getRow(costHeaderRow));
    availableUnits.forEach((unit, unitIndex) => {
      sheet.getRow(costDataStartRow + unitIndex).values = [
        unit.id,
        ...pendingCalls.map((call) => costMatrix.feasibility[unit.id]?.[call.id]
          ? costMatrix.costs[unit.id]?.[call.id] ?? INFEASIBLE_CELL_COST
          : INFEASIBLE_CELL_COST),
      ];
    });
    const queueCostRow = costDataStartRow + availableUnits.length;
    sheet.getCell(queueCostRow, 1).value = 'Queue cost';
    pendingCalls.forEach((call, index) => {
      sheet.getCell(queueCostRow, index + 2).value = costMatrix.queueCosts[call.id] ?? 0;
    });

    const decisionTitleRow = queueCostRow + 3;
    const decisionHeaderRow = decisionTitleRow + 1;
    const decisionDataStartRow = decisionTitleRow + 2;
    const decisionQueueRow = decisionDataStartRow + availableUnits.length;
    const constraintRow = decisionQueueRow + 1;
    const unitSumCol = pendingCalls.length + 2;
    sheet.getCell(decisionTitleRow, 1).value = isExpected
      ? 'AURA expected binary assignment xᵢⱼ'
      : 'Decision variables xᵢⱼ (changing cells)';
    sheet.getRow(decisionHeaderRow).values = ['Unit', ...callHeaders, 'Row sum'];
    setHeader(sheet.getRow(decisionHeaderRow));
    availableUnits.forEach((unit, unitIndex) => {
      const rowNumber = decisionDataStartRow + unitIndex;
      sheet.getCell(rowNumber, 1).value = unit.id;
      pendingCalls.forEach((call, callIndex) => {
        const cell = sheet.getCell(rowNumber, callIndex + 2);
        cell.value = isExpected ? assignmentMap.get(`${unit.id}\0${call.id}`) ?? 0 : 0;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isExpected ? 'FFE7EFE9' : 'FFFFE9A8' } };
      });
      const firstDecisionCol = columnName(2);
      const lastDecisionCol = columnName(pendingCalls.length + 1);
      sheet.getCell(rowNumber, unitSumCol).value = pendingCalls.length
        ? { formula: `SUM(${firstDecisionCol}${rowNumber}:${lastDecisionCol}${rowNumber})` }
        : { formula: '0' };
    });
    sheet.getCell(decisionQueueRow, 1).value = 'Queue uⱼ';
    pendingCalls.forEach((call, callIndex) => {
      const cell = sheet.getCell(decisionQueueRow, callIndex + 2);
      cell.value = isExpected ? Number(queued.has(call.id)) : 0;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isExpected ? 'FFE7EFE9' : 'FFFFE9A8' } };
    });
    sheet.getCell(constraintRow, 1).value = 'Call sum incl. queue';
    pendingCalls.forEach((_call, callIndex) => {
      const column = columnName(callIndex + 2);
      sheet.getCell(constraintRow, callIndex + 2).value = {
        formula: availableUnits.length
          ? `SUM(${column}${decisionDataStartRow}:${column}${decisionQueueRow})`
          : `${column}${decisionQueueRow}`,
      };
    });
    sheet.getCell(decisionQueueRow, unitSumCol).value = pendingCalls.length
      ? { formula: `SUM(${columnName(2)}${decisionQueueRow}:${columnName(pendingCalls.length + 1)}${decisionQueueRow})` }
      : { formula: '0' };

    const modelCostFirstCol = columnName(2);
    const modelCostLastCol = columnName(pendingCalls.length + 1);
    const modelCostFirstRow = costDataStartRow;
    const modelCostLastRow = costDataStartRow + availableUnits.length - 1;
    const decisionFirstRow = decisionDataStartRow;
    const decisionLastRow = decisionDataStartRow + availableUnits.length - 1;
    const assignmentProduct = availableUnits.length && pendingCalls.length
      ? `SUMPRODUCT(${modelCostFirstCol}${modelCostFirstRow}:${modelCostLastCol}${modelCostLastRow},${modelCostFirstCol}${decisionFirstRow}:${modelCostLastCol}${decisionLastRow})`
      : '0';
    const queueProduct = pendingCalls.length
      ? `SUMPRODUCT(${modelCostFirstCol}${queueCostRow}:${modelCostLastCol}${queueCostRow},${modelCostFirstCol}${decisionQueueRow}:${modelCostLastCol}${decisionQueueRow})`
      : '0';
    sheet.getCell('B2').value = { formula: `${assignmentProduct}+${queueProduct}` };

    const parameterCol = pendingCalls.length + 5;
    sheet.getCell(3, parameterCol).value = 'Solver parameters';
    sheet.getCell(3, parameterCol).font = { bold: true, size: 12 };
    const changingCells = `$${columnName(2)}$${decisionDataStartRow}:$${columnName(pendingCalls.length + 1)}$${decisionQueueRow}`;
    const parameterRows: Array<[string, string]> = [
      ['Objective cell', '$B$2'],
      ['To', 'Min'],
      ['Changing cells', pendingCalls.length ? changingCells : 'No decision cells'],
      ['Constraints', `unit row sums <= 1; call sums incl. queue = 1`],
      ['Variable type', 'Binary'],
      ['Method', 'Simplex LP'],
      ['Cost handling', 'ALS penalty is included in feasible cost cells; queue variables incur weighted unserved_min.'],
      ['Infeasible cells', `${INFEASIBLE_CELL_COST}; never selected when a feasible/queue choice exists.`],
    ];
    parameterRows.forEach(([label, value], index) => {
      sheet.getCell(4 + index, parameterCol).value = label;
      sheet.getCell(4 + index, parameterCol + 1).value = value;
      sheet.getCell(4 + index, parameterCol + 1).alignment = { wrapText: true, vertical: 'top' };
    });
    setBox(sheet, 3, 3 + parameterRows.length, parameterCol, parameterCol + 1);
    sheet.getColumn(parameterCol).width = 22;
    sheet.getColumn(parameterCol + 1).width = 68;
    sheet.getCell('B2').numFmt = '0.000000';
    sheet.getCell('C2').numFmt = '0.000000';
    sheet.getCell('D2').numFmt = '0.000000';
    sheet.autoFilter = { from: { row: decisionHeaderRow, column: 1 }, to: { row: decisionQueueRow, column: unitSumCol } };

    return { objective: solution.objective, crossCheck: solution.crossCheck.value, costMatrix };
  });
}

export async function buildSolverWorkbook(
  state: OperationalState,
  mode: 'Weighted' | 'Plain',
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AURA';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const availableUnits = state.units.filter((unit) => unit.status === 'Available').sort((left, right) => left.id.localeCompare(right.id));
  const pendingCalls = state.calls.filter((call) => call.status === 'Pending').sort((left, right) => left.id.localeCompare(right.id));
  const model = workbook.addWorksheet('Model');
  const expected = workbook.addWorksheet('Expected');
  const modelResult = await writeOptimizationSheet(model, 'Excel Solver model', mode, availableUnits, pendingCalls, state.zones, state.edges, state.config, false);
  await writeOptimizationSheet(expected, 'AURA expected assignment', mode, availableUnits, pendingCalls, state.zones, state.edges, state.config, true);
  expected.getCell('E2').value = `HiGHS/Hungarian difference: ${Math.abs(modelResult.objective - modelResult.crossCheck).toFixed(6)}`;

  const data = workbook.addWorksheet('Data');
  data.columns = [
    { header: 'Record type', key: 'type', width: 20 },
    { header: 'ID / key', key: 'id', width: 24 },
    { header: 'Details', key: 'details', width: 90 },
  ];
  setHeader(data.getRow(1));
  state.units.forEach((unit) => data.addRow({ type: 'Unit', id: unit.id, details: JSON.stringify(unit) }));
  state.calls.forEach((call) => data.addRow({ type: 'Call', id: call.id, details: JSON.stringify(call) }));
  state.zones.forEach((zone) => data.addRow({ type: 'Zone', id: zone.id, details: JSON.stringify(zone) }));
  state.edges.forEach((edge, index) => data.addRow({ type: 'Road edge', id: `edge-${index + 1}`, details: JSON.stringify(edge) }));
  data.addRow({ type: 'Config', id: 'app_config', details: JSON.stringify(state.config) });

  const travel = buildTravelMatrix(availableUnits, pendingCalls, state.zones, state.edges);
  for (const unit of availableUnits) {
    for (const call of pendingCalls) {
      const value = travel.rawTimes[unit.id]?.[call.id] ?? Infinity;
      data.addRow({
        type: 'Dijkstra path',
        id: `${unit.id} -> ${call.id}`,
        details: JSON.stringify({
          travelMin: Number.isFinite(value) ? value : 'Unreachable',
          path: travel.paths[unit.id]?.[call.id] ?? [],
        }),
      });
    }
  }
  return workbook;
}

export const exportRouter = Router();

exportRouter.get('/export/solver.xlsx', asyncHandler(async (request, response) => {
  const queryMode = String(request.query.mode ?? 'weighted').toLowerCase();
  if (queryMode !== 'weighted' && queryMode !== 'plain') {
    throw new HttpError(400, 'INVALID_MODE', 'mode must be weighted or plain');
  }
  const state = await loadOperationalState();
  const workbook = await buildSolverWorkbook(state, queryMode === 'plain' ? 'Plain' : 'Weighted');
  const buffer = await workbook.xlsx.writeBuffer();
  response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  response.setHeader('Content-Disposition', `attachment; filename="aura-solver-${queryMode}.xlsx"`);
  return response.send(Buffer.from(buffer));
}));