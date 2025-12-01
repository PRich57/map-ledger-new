import { render, screen, within } from './testUtils';
import BatchMapModal from '../components/mapping/BatchMapModal';
import { createSeedDatapoints } from '../data/coaSeeds';
import { getChartOfAccountOptions } from '../store/chartOfAccountsStore';
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
      .map((option: HTMLOptionElement) => option.textContent?.trim() ?? null)
      .filter((label): label is string => Boolean(label));

    getChartOfAccountOptions().forEach(option => {
      expect(optionLabels).toContain(option.label);
    });
  });
});