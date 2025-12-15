import { MappedCategoryAccordion } from '../components/mapping/MappedActivityAccordion';
import type { ReconciliationSubcategoryGroup } from '../types';
import { fireEvent, render, screen } from './testUtils';

describe('MappedCategoryAccordion', () => {
  it('shows the GL month for each source row inside the nested accordion', () => {
    const groups: ReconciliationSubcategoryGroup[] = [
      {
        subcategory: 'Revenue',
        total: 2000,
        accounts: [
          {
            id: 'rev-acc',
            label: 'Linehaul Revenue',
            subcategory: 'Revenue',
            total: 2000,
            sources: [
              {
                glAccountId: '4000',
                glAccountName: 'Freight Revenue',
                companyName: 'Acme Logistics',
                entityName: 'Acme East',
                glMonth: '2024-10-01',
                amount: 1250,
              },
              {
                glAccountId: '4010',
                glAccountName: 'Fuel Surcharge',
                companyName: 'Acme Logistics',
                glMonth: null,
                amount: 750,
              },
            ],
          },
        ],
      },
    ];

    render(<MappedCategoryAccordion groups={groups} ariaLabel="Reconciliation overview" />);

    const accountToggle = screen.getByRole('button', { name: /linehaul revenue/i });
    fireEvent.click(accountToggle);

    expect(screen.getByText(/GL month 2024-10-01/i)).toBeInTheDocument();
    expect(screen.getByText(/Unspecified GL month/i)).toBeInTheDocument();
  });
});
