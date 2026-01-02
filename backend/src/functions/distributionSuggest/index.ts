import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json } from '../../http';
import {
  listEntityScoaDistributionsWithDetails,
  type EntityScoaDistributionWithDetailsRow,
} from '../../repositories/entityScoaDistributionRepository';

type DistributionType = 'direct' | 'percentage' | 'dynamic';
type DistributionStatus = 'Distributed' | 'Undistributed';

interface DistributionOperationSuggestion {
  id: string;
  code: string;
  name: string;
  allocation?: number | null;
  basisDatapoint?: string | null;
}

interface DistributionSuggestionRow {
  entityId: string;
  entityAccountId: string;
  scoaAccountId: string;
  distributionType: DistributionType;
  distributionStatus: DistributionStatus;
  presetGuid?: string | null;
  presetDescription?: string | null;
  operations: DistributionOperationSuggestion[];
}

const normalizeDistributionType = (value?: string | null): DistributionType => {
  if (!value) {
    return 'direct';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'percentage') {
    return 'percentage';
  }
  if (normalized === 'dynamic') {
    return 'dynamic';
  }
  return 'direct';
};

const normalizeDistributionStatus = (value?: string | null): DistributionStatus => {
  if (!value) {
    return 'Undistributed';
  }
  return value.trim().toLowerCase() === 'distributed' ? 'Distributed' : 'Undistributed';
};

const mapOperations = (
  row: EntityScoaDistributionWithDetailsRow,
  type: DistributionType,
): DistributionOperationSuggestion[] => {
  if (!row.presetDetails?.length) {
    return [];
  }

  const operations: DistributionOperationSuggestion[] = [];
  row.presetDetails.forEach(detail => {
    const id = detail.operationCd?.trim();
    if (!id) {
      return;
    }
    const allocation =
      type === 'dynamic'
        ? null
        : detail.specifiedPct ?? (type === 'direct' ? 100 : null);
    operations.push({
      id,
      code: id,
      name: id,
      allocation,
      basisDatapoint: detail.basisDatapoint ?? null,
    });
  });

  return operations;
};

const mapToSuggestion = (row: EntityScoaDistributionWithDetailsRow): DistributionSuggestionRow => {
  const distributionType = normalizeDistributionType(row.distributionType);
  return {
    entityId: row.entityId,
    entityAccountId: row.entityAccountId,
    scoaAccountId: row.scoaAccountId,
    distributionType,
    distributionStatus: normalizeDistributionStatus(row.distributionStatus),
    presetGuid: row.presetGuid ?? null,
    presetDescription: row.presetDescription ?? null,
    operations: mapOperations(row, distributionType),
  };
};

export async function distributionSuggestHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const entityId = request.query.get('entityId')?.trim();
    if (!entityId) {
      return json({ message: 'entityId is required' }, 400);
    }

    const distributions = await listEntityScoaDistributionsWithDetails(entityId);
    const items = distributions.map(mapToSuggestion);
    return json({ items });
  } catch (error) {
    context.error('Failed to build distribution suggestions', error);
    return json({ message: 'Failed to build distribution suggestions' }, 500);
  }
}

app.http('distributionSuggest', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'distribution/suggest',
  handler: distributionSuggestHandler,
});

export default distributionSuggestHandler;
