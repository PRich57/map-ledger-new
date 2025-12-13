import { buildOperationScoaActivitySheets } from './exportScoaActivity';
import type { GLAccountMappingRow } from '../types';

const createRow = (overrides: Partial<GLAccountMappingRow> = {}): GLAccountMappingRow => ({
  id: overrides.id ?? 'row-1',
  entityId: overrides.entityId ?? 'entity-1',
  entityName: overrides.entityName ?? 'Entity 1',
  accountId: overrides.accountId ?? '1000',
  accountName: overrides.accountName ?? 'Sample Account',
  activity: overrides.activity ?? 0,
  status: overrides.status ?? 'Mapped',
  mappingType: overrides.mappingType ?? 'direct',
  netChange: overrides.netChange ?? 0,
  operation: overrides.operation ?? 'OPS-A',
  polarity: overrides.polarity ?? 'Debit',
  splitDefinitions: overrides.splitDefinitions ?? [],
  entities: overrides.entities ?? [],
  glMonth: overrides.glMonth,
  manualCOAId: overrides.manualCOAId ?? '2990',
  suggestedCOAId: overrides.suggestedCOAId,
  suggestedCOADescription: overrides.suggestedCOADescription,
  aiConfidence: overrides.aiConfidence,
  presetId: overrides.presetId,
  notes: overrides.notes,
  dynamicExclusionAmount: overrides.dynamicExclusionAmount,
  requiresEntityAssignment: overrides.requiresEntityAssignment,
});

describe('buildOperationScoaActivitySheets', () => {
  test('groups rows by operation and month while normalizing gl months', () => {
    const rows = [
      createRow({
        id: 'row-1',
        accountId: '1000',
        accountName: 'Fuel',
        manualCOAId: '2990',
        operation: 'OP-01',
        netChange: 120,
        glMonth: '2024-05',
      }),
      createRow({
        id: 'row-2',
        accountId: '1001',
        accountName: 'Fuel',
        manualCOAId: '2990',
        operation: 'OP-01',
        netChange: 30,
        glMonth: '2024-05',
      }),
      createRow({
        id: 'row-3',
        accountId: '1002',
        accountName: 'Payroll',
        manualCOAId: '2',
        operation: 'OP-02',
        netChange: 200,
        glMonth: '202406',
      }),
      createRow({
        id: 'row-4',
        accountId: '1003',
        accountName: 'Payroll',
        suggestedCOAId: '2',
        operation: 'OP-02',
        netChange: 80,
        glMonth: '2024-07',
      }),
    ];

    const sheets = buildOperationScoaActivitySheets(rows, []);

    expect(sheets).toHaveLength(2);
    const opOne = sheets.find(sheet => sheet.operationCd === 'OP-01');
    expect(opOne).toBeDefined();
    expect(opOne?.months).toEqual(['2024-05-01']);
    const opOneRow = opOne?.rows.find(row => row.glId === '2990');
    expect(opOneRow).toBeDefined();
    expect(opOneRow?.monthValues['2024-05-01']).toBe(150);

    const opTwo = sheets.find(sheet => sheet.operationCd === 'OP-02');
    expect(opTwo).toBeDefined();
    expect(opTwo?.months).toEqual(['2024-06-01', '2024-07-01']);
    const opTwoRow = opTwo?.rows.find(row => row.glId === '2');
    expect(opTwoRow?.monthValues['2024-06-01']).toBe(200);
  });

  test('ignores rows without SCoA or glMonth information', () => {
    const rows = [
      createRow({
        id: 'row-5',
        manualCOAId: '2990',
        operation: 'OP-03',
        glMonth: '2024-08',
        netChange: 50,
      }),
      createRow({
        id: 'row-6',
        manualCOAId: '',
        operation: 'OP-03',
        glMonth: '2024-08',
        netChange: 30,
      }),
      createRow({
        id: 'row-7',
        manualCOAId: '2990',
        operation: 'OP-03',
        netChange: 40,
      }),
    ];

    const sheets = buildOperationScoaActivitySheets(rows, []);
    expect(sheets).toHaveLength(1);
    const sheet = sheets[0];
    expect(sheet.rows.find(row => row.glId === '2990')?.monthValues['2024-08-01']).toBe(50);
  });
});
