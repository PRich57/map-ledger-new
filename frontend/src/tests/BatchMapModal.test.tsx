import { render, screen, within } from '@testing-library/react';
import BatchMapModal from '../components/mapping/BatchMapModal';
import { createSeedDatapoints } from '../data/coaSeeds';
import { STANDARD_CHART_OF_ACCOUNTS } from '../data/standardChartOfAccounts';
import { buildTargetScoaOptions } from '../utils/targetScoaOptions';

describe('BatchMapModal', () => {
  it('renders all COA options in the batch mapping selector', () => {
    const datapoints = createSeedDatapoints();
    const targetOptions = buildTargetScoaOptions(datapoints);

    render(
      <BatchMapModal
        open
        targetOptions={targetOptions}
        selectedCount={3}
        onClose={jest.fn()}
        onApply={jest.fn()}
      />,
    );

    const targetSelect = screen.getByLabelText('Target SCoA');
    const optionLabels = within(targetSelect)
      .getAllByRole('option')
      .map(option => option.textContent?.trim())
      .filter((label): label is string => Boolean(label));

    STANDARD_CHART_OF_ACCOUNTS.forEach(option => {
      expect(optionLabels).toContain(option.label);
    });
  });
});
