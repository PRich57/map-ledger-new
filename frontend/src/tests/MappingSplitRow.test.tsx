import { fireEvent, render, screen } from './testUtils';
import MappingSplitRow from '../components/mapping/MappingSplitRow';
import type { GLAccountMappingRow, TargetScoaOption } from '../types';

const targetOptions: TargetScoaOption[] = [
  { id: 'target-a', value: 'target-a', label: 'Target A' },
  { id: 'target-b', value: 'target-b', label: 'Target B' },
];

const buildAccount = (): GLAccountMappingRow => ({
  id: 'acct-test',
  companyId: 'company-1',
  companyName: 'Acme Logistics',
  entityId: 'entity-1',
  entityName: 'Acme Entity',
  accountId: '5000',
  accountName: 'Payroll Taxes',
  activity: 100000,
  status: 'New',
  mappingType: 'percentage',
  netChange: 100000,
  operation: 'Shared Services',
  polarity: 'Debit',
  splitDefinitions: [
    {
      id: 'split-a',
      targetId: 'target-a',
      targetName: 'Target A',
      allocationType: 'percentage',
      allocationValue: 60,
    },
    {
      id: 'split-b',
      targetId: 'target-b',
      targetName: 'Target B',
      allocationType: 'percentage',
      allocationValue: 40,
    },
  ],
  companies: [
    { id: 'entity-1', company: 'Acme Entity', balance: 100000 },
  ],
});

const renderSplitRow = () => {
  const onUpdateSplit = jest.fn();
  render(
    <table>
      <tbody>
        <MappingSplitRow
          account={buildAccount()}
          targetOptions={targetOptions}
          colSpan={1}
          panelId="panel-id"
          onAddSplit={jest.fn()}
          onUpdateSplit={onUpdateSplit}
          onRemoveSplit={jest.fn()}
        />
      </tbody>
    </table>,
  );
  return { onUpdateSplit };
};

describe('MappingSplitRow percentage input', () => {
  test('allows clearing the percentage field without committing a value', () => {
    const { onUpdateSplit } = renderSplitRow();
    const [firstInput] = screen.getAllByLabelText('Enter percentage allocation');

    expect(firstInput).toHaveValue('60.00');

    fireEvent.change(firstInput, { target: { value: '' } });

    expect(firstInput).toHaveValue('');
    expect(onUpdateSplit).not.toHaveBeenCalled();
  });

  test('commits a multi-digit decimal only after blur', () => {
    const { onUpdateSplit } = renderSplitRow();
    const inputs = screen.getAllByLabelText('Enter percentage allocation');
    const firstInput = inputs[0] as HTMLInputElement;
    const secondInput = inputs[1] as HTMLInputElement;

    fireEvent.change(firstInput, { target: { value: '12.34' } });

    expect(firstInput).toHaveValue('12.34');
    expect(onUpdateSplit).not.toHaveBeenCalled();

    fireEvent.blur(firstInput, { target: { value: '12.34' } });

    expect(onUpdateSplit).toHaveBeenNthCalledWith(1, 'split-a', {
      allocationType: 'percentage',
      allocationValue: 12.34,
    });
    expect(onUpdateSplit).toHaveBeenNthCalledWith(2, 'split-b', {
      allocationType: 'percentage',
      allocationValue: 87.66,
    });
    expect(firstInput).toHaveValue('12.34');
    expect(secondInput).toHaveValue('87.66');
  });

  test('restores the previous value when blur occurs on an intermediate string', () => {
    const { onUpdateSplit } = renderSplitRow();
    const [firstInput] = screen.getAllByLabelText('Enter percentage allocation');

    fireEvent.change(firstInput, { target: { value: '.' } });
    expect(firstInput).toHaveValue('.');

    fireEvent.blur(firstInput, { target: { value: '.' } });

    expect(onUpdateSplit).not.toHaveBeenCalled();
    expect(firstInput).toHaveValue('60.00');
  });
});
