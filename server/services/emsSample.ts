import ExcelJS from 'exceljs';
import path from 'node:path';

export interface EmsSampleRow {
  readonly id: string;
  readonly district: string;
  readonly call_type: string;
  readonly triage: string;
  readonly priority: string;
  readonly response_sec: number;
  readonly benchmark_sec: number;
  readonly hour: number;
}

const workbookPath = path.resolve(process.cwd(), 'data', 'tamil_nadu_ambulance_data.xlsx');
let sampleRowsPromise: Promise<readonly EmsSampleRow[]> | undefined;

function columnIndex(sheet: ExcelJS.Worksheet, name: string): number {
  const headers = sheet.getRow(1);
  let match = 0;
  headers.eachCell((cell, column) => {
    if (cell.text.trim().toLocaleLowerCase() === name.toLocaleLowerCase()) match = column;
  });
  if (!match) throw new Error(`EMS workbook is missing the ${name} column`);
  return match;
}

function textCell(row: ExcelJS.Row, column: number): string | null {
  const value = row.getCell(column).value;
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    return text.length ? text : null;
  }
  return null;
}

function requiredTextCell(row: ExcelJS.Row, column: number, label: string): string {
  const value = textCell(row, column);
  if (!value) throw new Error(`EMS workbook row ${row.number} is missing ${label}`);
  return value;
}

function durationSeconds(cell: ExcelJS.Cell, label: string): number {
  const value = cell.value;
  let seconds: number;
  if (value instanceof Date) {
    seconds = (value.getTime() - Date.UTC(1899, 11, 30)) / 1000;
  } else if (typeof value === 'number') {
    seconds = /[hms]/i.test(cell.numFmt) ? value * 86400 : value;
  } else if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{1,3}):([0-5]?\d):([0-5]?\d)(?:\.(\d+))?$/);
    if (!match) throw new Error(`EMS workbook row ${cell.row} has an invalid ${label}`);
    seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    if (match[4]) seconds += Number(`0.${match[4]}`);
  } else {
    throw new Error(`EMS workbook row ${cell.row} is missing ${label}`);
  }
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`EMS workbook row ${cell.row} has an invalid ${label}`);
  }
  return seconds;
}

function loadWorkbookRows(): Promise<readonly EmsSampleRow[]> {
  return (async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(workbookPath);
    const sheet = workbook.getWorksheet('dummy_ambulance_data');
    if (!sheet) throw new Error('EMS workbook is missing the dummy_ambulance_data sheet');

    const columns = {
      district: columnIndex(sheet, 'Caller District'),
      triage: columnIndex(sheet, 'triage'),
      callType: columnIndex(sheet, 'Emergency Type - New'),
      fallbackCallType: columnIndex(sheet, 'Emergency Type'),
      response: columnIndex(sheet, 'Response Time'),
      benchmark: columnIndex(sheet, 'Bench Mark'),
      hour: columnIndex(sheet, 'Hour'),
    };
    const rows: EmsSampleRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const triage = textCell(row, columns.triage) ?? 'Unclassified';
      const callType = textCell(row, columns.callType) ?? textCell(row, columns.fallbackCallType);
      if (!callType) throw new Error(`EMS workbook row ${row.number} is missing call type`);
      const hourValue = Number(row.getCell(columns.hour).value);
      if (!Number.isInteger(hourValue) || hourValue < 0 || hourValue > 23) {
        throw new Error(`EMS workbook row ${row.number} has an invalid hour`);
      }
      rows.push({
        id: `SAMPLE-${String(rows.length + 1).padStart(2, '0')}`,
        district: requiredTextCell(row, columns.district, 'district'),
        call_type: callType,
        triage,
        priority: triage,
        response_sec: durationSeconds(row.getCell(columns.response), 'response time'),
        benchmark_sec: durationSeconds(row.getCell(columns.benchmark), 'benchmark'),
        hour: hourValue,
      });
    });
    if (rows.length !== 50) throw new Error(`EMS workbook contains ${rows.length} cases; expected the provided 50-row sample`);
    return rows;
  })();
}

export function getEmsSampleRows(): Promise<readonly EmsSampleRow[]> {
  sampleRowsPromise ??= loadWorkbookRows();
  return sampleRowsPromise;
}
