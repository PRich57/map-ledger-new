import { act } from 'react';
import MappingHeader, { formatUploadLabel } from '../components/mapping/MappingHeader';
import { useClientStore } from '../store/clientStore';
import { useMappingStore } from '../store/mappingStore';
import { render, screen } from './testUtils';

describe('MappingHeader upload label', () => {
  const originalTimeZone = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/New_York';
    act(() => {
      useClientStore.setState({
        clients: [
          {
            id: 'C1',
            clientId: 'C1',
            name: 'Client One',
            scac: 'CONE',
            operations: [],
          },
        ],
        activeClientId: 'C1',
        isLoading: false,
        error: null,
      });

      useMappingStore.setState(state => ({
        ...state,
        activeUploadId: 'demo-guid',
        activeUploadMetadata: {
          uploadId: 'demo-guid',
          fileName: 'ledger.xlsx',
          uploadedAt: '2024-03-15T18:30:00Z',
        },
      }));
    });
  });

  afterEach(() => {
    process.env.TZ = originalTimeZone;
    act(() => {
      useMappingStore.setState(state => ({
        ...state,
        activeUploadId: null,
        activeUploadMetadata: null,
      }));
      useClientStore.setState({
        clients: [],
        activeClientId: null,
        isLoading: false,
        error: null,
      });
    });
  });

  it('displays the filename with a localized upload timestamp', () => {
    render(<MappingHeader clientId="C1" glUploadId="demo-guid" />);

    const expectedLabel = formatUploadLabel({
      uploadId: 'demo-guid',
      fileName: 'ledger.xlsx',
      uploadedAt: '2024-03-15T18:30:00Z',
      timeZone: 'America/New_York',
    });
    const [, expectedTimestamp] = expectedLabel.split(' - ');

    const label = screen.getByText(/^Upload /);
    const labelText = label.textContent ?? '';

    expect(labelText).toContain('ledger.xlsx');
    expect(labelText).toContain(expectedTimestamp);
    expect(labelText).not.toContain('demo-guid');
  });
});
