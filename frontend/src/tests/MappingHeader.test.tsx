import MappingHeader from '../components/mapping/MappingHeader';
import { useClientStore } from '../store/clientStore';
import { useMappingStore } from '../store/mappingStore';
import { render, screen } from './testUtils';

describe('MappingHeader upload label', () => {
  const originalTimeZone = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/New_York';
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

  afterEach(() => {
    process.env.TZ = originalTimeZone;
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

  it('displays the filename with a localized upload timestamp', () => {
    render(<MappingHeader clientId="C1" glUploadId="demo-guid" />);

    expect(
      screen.getByText("Upload 'ledger.xlsx' - 2024-03-15 2:30 PM EDT"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Upload demo-guid/i)).not.toBeInTheDocument();
  });
});
