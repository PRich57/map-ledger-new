jest.mock('../src/repositories/clientEntityRepository', () => ({
  updateClientEntity: jest.fn(),
  listClientEntities: jest.fn(),
  createClientEntity: jest.fn(),
  softDeleteClientEntity: jest.fn(),
}));

import { updateClientEntityHandler } from '../src/functions/clientEntities';
import { updateClientEntity } from '../src/repositories/clientEntityRepository';

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
});
