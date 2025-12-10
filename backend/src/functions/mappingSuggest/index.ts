import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json } from '../../http';
import {
  listEntityAccountMappingsByFileUpload,
  EntityAccountMappingWithRecord,
  EntityMappingPresetDetailRow,
  listEntityAccountMappingsWithPresets,
} from '../../repositories/entityAccountMappingRepository';

type MappingStatus = 'Mapped' | 'Unmapped' | 'New' | 'Excluded';
type MappingType = 'direct' | 'percentage' | 'dynamic' | 'exclude';
type MappingPolarity = 'Debit' | 'Credit' | 'Absolute';

interface MappingSuggestionRow {
  id: string;
  entityId: string;
  entityName: string;
  accountId: string;
  accountName: string;
  activity: number;
  netChange: number;
  status: MappingStatus;
  mappingType: MappingType;
  polarity: MappingPolarity;
  presetId?: string | null;
  exclusionPct?: number | null;
  splitDefinitions: {
    id: string;
    targetId: string;
    targetName: string;
    allocationType: 'percentage' | 'amount';
    allocationValue: number;
    notes?: string;
  }[];
  entities: { id: string; entity: string; balance: number }[];
  glMonth?: string | null;
}

const derivePolarity = (amount?: number | null, fallback?: string | null): MappingPolarity => {
  if (fallback && ['debit', 'credit', 'absolute'].includes(fallback.toLowerCase())) {
    return fallback.charAt(0).toUpperCase() === 'A'
      ? 'Absolute'
      : (fallback.charAt(0).toUpperCase() + fallback.slice(1).toLowerCase()) as MappingPolarity;
  }

  if ((amount ?? 0) > 0) {
    return 'Debit';
  }
  if ((amount ?? 0) < 0) {
    return 'Credit';
  }
  return 'Absolute';
};

const normalizeStatus = (status?: string | null, mappingType?: string | null): MappingStatus => {
  if (status) {
    const normalized = status.trim().toLowerCase();
    if (normalized === 'excluded' || normalized === 'exclude') {
      return 'Excluded';
    }
    if (normalized === 'mapped') {
      return 'Mapped';
    }
    if (normalized === 'new') {
      return 'New';
    }
  }

  if (mappingType?.trim().toLowerCase() === 'exclude') {
    return 'Excluded';
  }

  return 'Unmapped';
};

const mapToSuggestion = (
  row: EntityAccountMappingWithRecord,
  fileUploadGuid: string,
): MappingSuggestionRow => {
  const normalizedType = (row.mappingType ?? '').trim().toLowerCase();
  const mappingType = ['direct', 'percentage', 'dynamic', 'exclude'].includes(normalizedType)
    ? (normalizedType as MappingType)
    : 'direct';
  const presetId = row.presetId ?? null;
  const details = presetId ? row.presetDetails ?? [] : [];
  const polarity = derivePolarity(row.activityAmount, row.polarity);
  const status = normalizeStatus(row.mappingStatus, mappingType);
  const entityId = row.entityId?.trim() || 'unknown-entity';
  const activity = row.activityAmount ?? 0;
  const hydratedDetails = details.filter(
    (detail): detail is EntityMappingPresetDetailRow & { targetDatapoint: string } =>
      Boolean(detail.targetDatapoint),
  );

  return {
    id: `${fileUploadGuid}-${row.recordId ?? row.entityAccountId}`,
    entityId,
    entityName: entityId,
    accountId: row.entityAccountId,
    accountName: row.accountName ?? row.entityAccountId,
    activity,
    netChange: activity,
    status,
    mappingType,
    polarity,
    presetId,
    exclusionPct: row.exclusionPct ?? null,
    splitDefinitions: hydratedDetails.map((detail, index) => {
      // Check if this is an exclusion split
      const isExclusionSplit = detail.targetDatapoint.toLowerCase() === 'excluded';

      return {
        id: `${presetId ?? 'preset'}-${index}`,
        targetId: isExclusionSplit ? '' : detail.targetDatapoint,
        targetName: isExclusionSplit ? 'Exclusion' : detail.targetDatapoint,
        allocationType: 'percentage',
        allocationValue: detail.specifiedPct ?? 0,
        notes: isExclusionSplit ? 'Excluded amount' : (detail.basisDatapoint ?? undefined),
        isCalculated: detail.isCalculated ?? undefined,
        isExclusion: isExclusionSplit,
      };
    }),
    entities: [
      {
        id: entityId,
        entity: entityId,
        balance: activity,
      },
    ],
    glMonth: row.glMonth ?? null,
  };
};

export async function mappingSuggestHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const fileUploadGuid = request.query.get('fileUploadGuid')?.trim();
    const entityId = request.query.get('entityId')?.trim();

    if (!fileUploadGuid && !entityId) {
      return json({ message: 'fileUploadGuid or entityId is required' }, 400);
    }

    const mappings = fileUploadGuid
      ? await listEntityAccountMappingsByFileUpload(fileUploadGuid)
      : await listEntityAccountMappingsWithPresets(entityId as string);

    const resolvedUploadGuid = fileUploadGuid ?? `${entityId}-preset`;
    const items = mappings.map((row) => mapToSuggestion(row, resolvedUploadGuid));
    return json({ items });
  } catch (error) {
    context.error('Failed to build mapping suggestions', error);
    return json({ message: 'Failed to build mapping suggestions' }, 500);
  }
}

app.http('mappingSuggest', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'mapping/suggest',
  handler: mappingSuggestHandler
});

export default mappingSuggestHandler;