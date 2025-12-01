import { render, screen } from './testUtils';
import userEvent from './userEvent';
import ExcludeAccounts from '../components/import/ExcludeAccounts';
import type { TrialBalanceRow } from '../types';

describe('ExcludeAccounts', () => {
  const rows: TrialBalanceRow[] = [
    { accountId: '1000', description: 'Cash', netChange: 10, entity: 'E1' },
    { accountId: '2000', description: 'AP', netChange: -5, entity: 'E1' },
  ];

  test('rows are included by default and can be excluded', async () => {
    const user = userEvent.setup();
    render(<ExcludeAccounts rows={rows} onConfirm={jest.fn()} />);

    expect(screen.getByText('Included: 2 • Excluded: 0')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    await user.click(boxes[0]);
    expect(screen.getByText('Included: 1 • Excluded: 1')).toBeInTheDocument();
  });
});