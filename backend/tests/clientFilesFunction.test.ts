import { ClientFileMetadataPayload, validateRecord } from '../src/functions/clientFiles';

describe('clientFiles.validateRecord', () => {
  const basePayload: ClientFileMetadataPayload = {
    clientId: 'client-123',
    sourceFileName: 'trial_balance.csv',
    insertedBy: 'uploader@example.com',
    fileStatus: 'completed',
  };

  it('accepts fileStorageUri values provided directly', () => {
    const payload: ClientFileMetadataPayload = {
      ...basePayload,
      fileStorageUri: 'https://storage.example.com/blob.csv',
    };

    const { record, errors } = validateRecord(payload);

    expect(errors).toHaveLength(0);
    expect(record?.fileStorageUri).toBe(payload.fileStorageUri);
  });

  it('falls back to a placeholder storage URI when none is provided', () => {
    const payload: ClientFileMetadataPayload = {
      ...basePayload,
    };

    const { record, errors } = validateRecord(payload);

    expect(errors).toHaveLength(0);
    expect(record?.fileStorageUri).toContain('storage.invalid');
  });

  it('requires an uploader email', () => {
    const payload: ClientFileMetadataPayload = {
      ...basePayload,
      insertedBy: undefined,
    };

    const { record, errors } = validateRecord(payload);

    expect(record).toBeNull();
    expect(errors).toContain('insertedBy (uploader email) is required');
  });

  it('normalizes a single period value into both GL period fields', () => {
    const payload: ClientFileMetadataPayload = {
      ...basePayload,
      fileStorageUri: 'https://storage.example.com/blob.csv',
      period: '2024-08',
    };

    const { record, errors } = validateRecord(payload);

    expect(errors).toHaveLength(0);
    expect(record?.glPeriodStart).toBe('2024-08');
    expect(record?.glPeriodEnd).toBe('2024-08');
  });
});
