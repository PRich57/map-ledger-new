import { COATemplate, Datapoint } from '../types';
import { COARow } from './parseCOATemplateFile';

interface TemplateInfo {
  name: string;
  industry: string;
  interval: 'Monthly' | 'Quarterly';
}

export function buildTemplateFromRows(rows: COARow[], info: TemplateInfo, templateId: string): { template: COATemplate; datapoints: Datapoint[] } {
  const funcMap = new Map<string, { id: string; code: string; name: string }>();
  const opMap = new Map<string, { id: string; code: string; name: string }>();

  const getOrCreate = (
    map: Map<string, { id: string; code: string; name: string }>,
    name: string,
    index: number
  ) => {
    if (!map.has(name)) {
      map.set(name, { id: crypto.randomUUID(), code: String((index + 1) * 100), name });
    }
    return map.get(name)!;
  };

  rows.forEach(() => {}); // placeholder to ensure loops run below

  const datapoints: Datapoint[] = rows.map((row, idx) => {
    const funcName = String(row['FunctionalGroup'] || row['functionalGroup'] || 'Default');
    const opName = String(row['OperationalGroup'] || row['operationalGroup'] || 'Default');
    const func = getOrCreate(funcMap, funcName, funcMap.size);
    const op = getOrCreate(opMap, opName, opMap.size);

    return {
      id: crypto.randomUUID(),
      templateId,
      accountName: String(
        row['AccountName'] ||
          row['Account'] ||
          row['AccountDescription'] ||
          row['GL_NAME'] ||
          row['gl_name'] ||
          ''
      ),
      accountDescription: String(
        row['Description'] ||
          row['AccountDescription'] ||
          row['GL_NAME'] ||
          row['gl_name'] ||
          ''
      ),
      type: 'Financial',
      accountType: String(row['AccountType'] || 'Expenses') as Datapoint['accountType'],
      balanceType: String(row['BalanceType'] || 'Debit') as Datapoint['balanceType'],
      coreGLAccount: String(
        row['AccountCode'] ||
          row['Code'] ||
          row['Account'] ||
          row['GL_ID'] ||
          row['gl_id'] ||
          ''
      ),
      detailLevel: Number(row['DETAIL_LEVEL'] || row['detail_level'] || 1),

      functionalGroupId: func.id,
      operationalGroupId: op.id,
      sortOrder: idx,
    };
  });

  const template: COATemplate = {
    id: templateId,
    name: info.name,
    industry: info.industry,
    interval: info.interval,
    functionalGroups: Array.from(funcMap.values()),
    operationalGroups: Array.from(opMap.values()),
  };

  return { template, datapoints };
}
