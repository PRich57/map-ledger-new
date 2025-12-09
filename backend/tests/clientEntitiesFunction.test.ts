jest.mock('../src/repositories/clientEntityRepository', () => ({
  updateClientEntity: jest.fn(),
  listClientEntities: jest.fn(),
  createClientEntity: jest.fn(),
  softDeleteClientEntity: jest.fn(),
}));

import { deleteClientEntityHandler, updateClientEntityHandler } from '../src/functions/clientEntities';
import { softDeleteClientEntity, updateClientEntity } from '../src/repositories/clientEntityRepository';

const baseEntity = {
  entityId: 'entity-1',
  clientId: 'client-1',
  entityName: 'Renamed Entity',
  entityDisplayName: 'Renamed Entity',
  entityStatus: 'ACTIVE' as const,
  aliases: [],
  updatedDttm: '2024-01-01T00:00:00.000Z',
  updatedBy: 'tester@example.com',
  deletedDttm: null,
  deletedBy: null,
  isDeleted: false,
};

describe('clientEntities.updateClientEntityHandler', () => {
  const mockUpdateClientEntity =
    updateClientEntity as jest.MockedFunction<typeof updateClientEntity>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the updated entity when a rename succeeds', async () => {
    mockUpdateClientEntity.mockResolvedValue({
      record: baseEntity,
      rowsAffected: 1,
    });

    const request = {
      params: { entityId: baseEntity.entityId },
      json: jest.fn().mockResolvedValue({
        clientId: baseEntity.clientId,
        entityName: baseEntity.entityName,
        entityDisplayName: baseEntity.entityDisplayName,
      }),
      headers: new Map(),
    } as any;

    const context = {
      error: jest.fn(),
    } as any;

    const response = await updateClientEntityHandler(request, context);

    expect(mockUpdateClientEntity).toHaveBeenCalledWith({
      clientId: baseEntity.clientId,
      entityId: baseEntity.entityId,
      entityName: baseEntity.entityName,
      entityDisplayName: baseEntity.entityDisplayName,
      entityStatus: undefined,
      updatedBy: undefined,
    });
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.item).toEqual(baseEntity);
  });

  it('passes through updatedBy from the client principal header', async () => {
    mockUpdateClientEntity.mockResolvedValue({
      record: baseEntity,
      rowsAffected: 1,
    });

    const principal = {
      identityProvider: 'aad',
      userId: 'user-123',
      userDetails: 'header-user@example.com',
      userRoles: [],
    };

    const request = {
      params: { entityId: baseEntity.entityId },
      json: jest.fn().mockResolvedValue({
        clientId: baseEntity.clientId,
        entityName: baseEntity.entityName,
        entityDisplayName: baseEntity.entityDisplayName,
      }),
      headers: new Map([
        [
          'x-ms-client-principal',
          Buffer.from(JSON.stringify(principal), 'utf8').toString('base64'),
        ],
      ]),
    } as any;

    const context = {
      error: jest.fn(),
    } as any;

    await updateClientEntityHandler(request, context);

    expect(mockUpdateClientEntity).toHaveBeenCalledWith({
      clientId: baseEntity.clientId,
      entityId: baseEntity.entityId,
      entityName: baseEntity.entityName,
      entityDisplayName: baseEntity.entityDisplayName,
      entityStatus: undefined,
      updatedBy: 'header-user@example.com',
    });
  });
});

describe('clientEntities.deleteClientEntityHandler', () => {
  const mockSoftDeleteClientEntity =
    softDeleteClientEntity as jest.MockedFunction<typeof softDeleteClientEntity>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('populates deletedBy when the principal header is present', async () => {
    const deletedRecord = {
      ...baseEntity,
      deletedBy: 'deleter@example.com',
      deletedDttm: '2024-01-02T00:00:00.000Z',
      isDeleted: true,
    };

    mockSoftDeleteClientEntity.mockResolvedValue(deletedRecord as any);

    const principal = {
      identityProvider: 'aad',
      userId: 'deleter',
      userDetails: 'deleter@example.com',
      userRoles: [],
    };

    const request = {
      params: { entityId: baseEntity.entityId },
      query: new Map([['clientId', baseEntity.clientId]]),
      headers: new Map([
        [
          'x-ms-client-principal',
          Buffer.from(JSON.stringify(principal), 'utf8').toString('base64'),
        ],
      ]),
    } as any;

    const context = {
      error: jest.fn(),
    } as any;

    const response = await deleteClientEntityHandler(request, context);

    expect(mockSoftDeleteClientEntity).toHaveBeenCalledWith({
      clientId: baseEntity.clientId,
      entityId: baseEntity.entityId,
      updatedBy: 'deleter@example.com',
    });
    expect(response.status).toBe(200);
  });
});
