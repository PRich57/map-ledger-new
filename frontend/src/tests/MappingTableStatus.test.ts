/**
 * @jest-environment node
 */

import { STATUS_ORDER } from '../components/mapping/MappingTable';
import { createInitialMappingAccounts, useMappingStore } from '../store/mappingStore';
import type { MappingStatus } from '../types';

describe('MappingTable status filters and sorting', () => {
  beforeEach(() => {
    useMappingStore.setState({
      accounts: createInitialMappingAccounts(),
      searchTerm: '',
      activeStatuses: [],
    });
  });

  afterEach(() => {
    useMappingStore.setState({ activeStatuses: [] });
  });

  const filterStatuses = (): MappingStatus[] => {
    const state = useMappingStore.getState();
    return state.accounts
      .filter(account => state.activeStatuses.length === 0 || state.activeStatuses.includes(account.status))
      .map(account => account.status);
  };

  it('filters rows when a renamed status is toggled', () => {
    useMappingStore.getState().toggleStatusFilter('Mapped');

    expect(filterStatuses()).toEqual(['Mapped', 'Mapped']);

    useMappingStore.getState().toggleStatusFilter('Mapped');

    expect(filterStatuses()).toEqual(['Mapped', 'Mapped', 'New', 'Excluded']);
  });

  it('sorts statuses according to the updated status order', () => {
    const statuses: MappingStatus[] = ['Mapped', 'New', 'Excluded', 'Unmapped'];
    const sorted = [...statuses].sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b]);

    expect(sorted).toEqual(['New', 'Unmapped', 'Mapped', 'Excluded']);
  });
});
