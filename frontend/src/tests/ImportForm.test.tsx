import { render, screen } from './testUtils';
import ImportForm, {
  filterRowsByGlMonth,
} from '../components/import/ImportForm';
import type { TrialBalanceRow } from '../types';

it('does not render operation selector', () => {
  render(<ImportForm onImport={jest.fn()} isImporting={false} />);
  expect(screen.queryByLabelText(/operation/i)).toBeNull();
});

describe('filterRowsByGlMonth', () => {
  const baseRows: TrialBalanceRow[] = [
    {
      accountId: '1000',
      description: 'Jan expense',
      netChange: 2500,
      entity: 'Northwind',
      glMonth: '2024-11',
      Gl_Month: '2024-01',
    },
    {
      accountId: '2000',
      description: 'Feb expense',
      netChange: 1800,
      entity: 'Northwind',
      glMonth: '2024-11',
      Gl_Month: '2024-02',
    },
  ];

  it('prioritizes row-level GL month values when filtering', () => {
    const filtered = filterRowsByGlMonth(baseRows, '2024-02');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].accountId).toBe('2000');
    expect(filtered[0].glMonth).toBe('2024-02');
  });

  it('retains all rows when no month is selected and normalizes values', () => {
    const filtered = filterRowsByGlMonth(baseRows, '');
    expect(filtered).toHaveLength(2);
    expect(filtered.map((row) => row.glMonth)).toEqual([
      '2024-01',
      '2024-02',
    ]);
  });
});