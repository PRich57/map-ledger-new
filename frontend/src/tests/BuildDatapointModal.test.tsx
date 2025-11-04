import { fireEvent, render, screen } from '@testing-library/react';
import BuildDatapointModal from '../components/mapping/BuildDatapointModal';
import type { GLAccountMappingRow, TargetScoaOption } from '../types';

describe('BuildDatapointModal', () => {
  const targetOptions: TargetScoaOption[] = [
    { id: 'scoa-100', value: '100', label: '100 · Cash' },
    { id: 'scoa-200', value: '200', label: '200 · Revenue' },
  ];

  const selectedAccounts: GLAccountMappingRow[] = [
    {
      id: 'account-1',
      companyId: 'co-1',
      companyName: 'Acme Freight',
      entityId: 'entity-1',
      entityName: 'Acme Freight HQ',
      accountId: '4000',
      accountName: 'Linehaul Revenue',
      activity: 0,
      status: 'Mapped',
      mappingType: 'direct',
      netChange: 12000,
      operation: 'Operations',
      polarity: 'Credit',
      splitDefinitions: [],
      companies: [],
    },
  ];

  it('requires selecting a target SCoA account before submitting', () => {
    const handleCreate = jest.fn();

    render(
      <BuildDatapointModal
        open
        selectedAccounts={selectedAccounts}
        targetOptions={targetOptions}
        onClose={jest.fn()}
        onCreate={handleCreate}
      />,
    );

    fireEvent.change(screen.getByLabelText('Datapoint name'), {
      target: { value: 'New revenue datapoint' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save datapoint/i }));

    expect(handleCreate).not.toHaveBeenCalled();
    expect(screen.getByText('Select a target SCoA account.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Target SCoA account'), {
      target: { value: targetOptions[1].value },
    });

    fireEvent.click(screen.getByRole('button', { name: /save datapoint/i }));

    expect(handleCreate).toHaveBeenCalledWith({
      name: 'New revenue datapoint',
      targetId: targetOptions[1].value,
    });
  });
});
