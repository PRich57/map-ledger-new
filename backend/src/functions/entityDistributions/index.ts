import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import crypto from 'node:crypto';
import { json, readJson } from '../../http';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { getFirstStringValue } from '../../utils/requestParsers';
import { withQueryTracking } from '../../utils/sqlClient';
import {
  createEntityDistributionPreset,
  listEntityDistributionPresetsWithDetails,
  updateEntityDistributionPreset,
  type EntityDistributionPresetWithDetailsRow,
} from '../../repositories/entityDistributionPresetRepository';
import {
  createEntityDistributionPresetDetails,
  deleteEntityDistributionPresetDetail,
  type EntityDistributionPresetDetailInput,
  type EntityDistributionPresetDetailRow,
  updateEntityDistributionPresetDetail,
} from '../../repositories/entityDistributionPresetDetailRepository';
import {
  deleteEntityScoaDistribution,
  insertEntityScoaDistributions,
  listEntityScoaDistributions,
  updateEntityScoaDistribution,
  type EntityScoaDistributionInput,
  type EntityScoaDistributionRow,
} from '../../repositories/entityScoaDistributionRepository';

type DistributionType = 'direct' | 'percentage' | 'dynamic';
type DistributionStatus = 'Distributed' | 'Undistributed';

interface DistributionSaveOperationPayload {
  operationCd?: string | null;
  allocation?: number | null;
  notes?: string | null;
  basisDatapoint?: string | null;
}

interface DistributionSaveRowPayload {
  scoaAccountId?: string | null;
  distributionType?: string | null;
  presetGuid?: string | null;
  presetDescription?: string | null;
  distributionStatus?: string | null;
  operations?: DistributionSaveOperationPayload[];
  updatedBy?: string | null;
}

interface DistributionSaveRequest {
  entityId?: string | null;
  items?: DistributionSaveRowPayload[];
  changedRows?: DistributionSaveRowPayload[];
}

interface DistributionSaveResult {
  scoaAccountId: string;
  presetGuid: string;
  distributionType: DistributionType;
  distributionStatus: DistributionStatus;
}

const normalizeText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDistributionType = (value?: string | null): DistributionType | null => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  const lowercased = normalized.toLowerCase();
  if (lowercased === 'direct' || lowercased === 'percentage' || lowercased === 'dynamic') {
    return lowercased as DistributionType;
  }
  return null;
};

const normalizeDistributionStatus = (value?: string | null): DistributionStatus => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 'Undistributed';
  }
  const normalizedCapitalized =
    normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  return normalizedCapitalized === 'Distributed' ? 'Distributed' : 'Undistributed';
};

const buildRequestPayload = (payload: unknown): DistributionSaveRequest => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const candidateItems = Array.isArray(record.changedRows)
    ? record.changedRows
    : Array.isArray(record.items)
      ? record.items
      : Array.isArray(payload)
        ? (payload as unknown[])
        : [];

  return {
    entityId: getFirstStringValue(record.entityId),
    items: candidateItems.map(item => {
      const entry = (item as Record<string, unknown>) ?? {};
      const operations =
        Array.isArray(entry.operations) && entry.operations.length > 0
          ? (entry.operations as unknown[])
              .map(
                (operation): DistributionSaveOperationPayload | null => {
                  const opRecord = (operation as Record<string, unknown>) ?? {};
                  const code =
                    normalizeText(opRecord.operationCd) ??
                    normalizeText(opRecord.operationId) ??
                    normalizeText(opRecord.code);
                  if (!code) {
                    return null;
                  }
                  const allocation = parseNumber(opRecord.allocation);
                  const basisDatapoint = normalizeText(
                    getFirstStringValue(opRecord.basisDatapoint ?? opRecord.basisDataPoint),
                  );
                  return {
                    operationCd: code.toUpperCase(),
                    allocation:
                      allocation !== null ? Math.max(0, Math.min(100, allocation)) : null,
                    notes: normalizeText(opRecord.notes),
                    basisDatapoint,
                  };
                },
              )
              .filter(
                (saved): saved is DistributionSaveOperationPayload => Boolean(saved),
              )
          : undefined;

      return {
        scoaAccountId: normalizeText(entry.scoaAccountId),
        distributionType: normalizeText(entry.distributionType),
        presetGuid:
          normalizeText(entry.presetGuid) ?? normalizeText(entry.presetId) ?? null,
        presetDescription: normalizeText(entry.presetDescription),
        distributionStatus: normalizeText(entry.distributionStatus),
        operations,
        updatedBy: normalizeText(entry.updatedBy),
      };
    }),
  };
};

const normalizePresetKey = (entityId: string, scoaAccountId: string): string =>
  `${entityId}|${scoaAccountId}`;

const isMeaningfulDescription = (value?: string | null): boolean =>
  typeof value === 'string' && value.trim().length > 1;

const isCanonicalPresetType = (value?: string | null): boolean => {
  if (!value) {
    return false;
  }
  const lower = value.trim().toLowerCase();
  return lower === 'direct' || lower === 'percentage' || lower === 'dynamic' || lower === 'excluded';
};

export const buildDetailInputs = (
  operations: DistributionSaveOperationPayload[] | undefined,
  presetGuid: string,
  type: DistributionType,
  updatedBy: string | null,
): EntityDistributionPresetDetailInput[] => {
  if (!operations || operations.length === 0) {
    return [];
  }
  const isDynamicType = type === 'dynamic';
  return operations
    .map(
      (operation): EntityDistributionPresetDetailInput | null => {
        const code = normalizeText(operation.operationCd);
        if (!code) {
          return null;
        }
        const basisDatapoint =
          isDynamicType && operation.basisDatapoint
            ? normalizeText(operation.basisDatapoint)
            : null;
        const specifiedPct = (() => {
          if (isDynamicType) {
            return null;
          }
          if (type === 'direct') {
            return 100;
          }
          if (typeof operation.allocation === 'number') {
            return Math.max(0, Math.min(100, operation.allocation));
          }
          return null;
        })();
        return {
          presetGuid,
          operationCd: code.toUpperCase(),
          basisDatapoint,
          isCalculated: isDynamicType,
          specifiedPct,
          updatedBy,
        };
      },
    )
    .filter(
      (detail): detail is EntityDistributionPresetDetailInput => Boolean(detail),
  );
};

const normalizeBasisKey = (value?: string | null): string => {
  if (!value) {
    return '';
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed.toLowerCase() : '';
};

const createDetailKey = (operationCd: string, basisDatapoint?: string | null): string =>
  `${operationCd.toUpperCase()}|${normalizeBasisKey(basisDatapoint)}`;

const areDetailInputsEqual = (
  current: EntityDistributionPresetDetailRow[],
  target: EntityDistributionPresetDetailInput[],
): boolean => {
  if (current.length !== target.length) {
    return false;
  }

  const currentMap = new Map<string, { pct: number | null; isCalculated: boolean | null }>();

  current.forEach(detail => {
    const key = createDetailKey(detail.operationCd, detail.basisDatapoint);
    currentMap.set(key, {
      pct: detail.specifiedPct ?? null,
      isCalculated: detail.isCalculated ?? null,
    });
  });

  return target.every(detail => {
    const key = createDetailKey(detail.operationCd, detail.basisDatapoint);
    const existing = currentMap.get(key);

    if (!existing) {
      return false;
    }

    return (
      (detail.specifiedPct ?? null) === existing.pct &&
      (detail.isCalculated ?? null) === existing.isCalculated
    );
  });
};

const ensurePreset = async (
  entityId: string,
  scoaAccountId: string,
  distributionType: DistributionType,
  presetGuid: string,
  presetDescription: string | null,
  presetLookup: Map<string, string>,
  presetMetadata: Map<string, EntityDistributionPresetWithDetailsRow>,
  updatedBy: string | null,
): Promise<{ created: boolean; preset: EntityDistributionPresetWithDetailsRow }> => {
  const cacheKey = normalizePresetKey(entityId, scoaAccountId);
  const cachedPresetGuid = presetLookup.get(cacheKey);
  const targetPresetGuid = cachedPresetGuid ?? presetGuid;

  const existingPreset =
    (targetPresetGuid ? presetMetadata.get(targetPresetGuid) : undefined) ??
    (presetGuid && presetGuid !== targetPresetGuid ? presetMetadata.get(presetGuid) : undefined);

  if (existingPreset) {
    const currentPresetType = normalizeDistributionType(existingPreset.presetType);
    const needsTypeRepair = !isCanonicalPresetType(existingPreset.presetType);
    const needsTypeUpdate = currentPresetType !== distributionType;
    const needsDescriptionRepair =
      presetDescription !== null && !isMeaningfulDescription(existingPreset.presetDescription);
    const needsScoaAccountUpdate = existingPreset.scoaAccountId !== scoaAccountId;

    if (needsTypeRepair || needsTypeUpdate || needsDescriptionRepair || needsScoaAccountUpdate) {
      const updatedPreset = await updateEntityDistributionPreset(existingPreset.presetGuid, {
        presetType: needsTypeRepair || needsTypeUpdate ? distributionType : undefined,
        presetDescription: needsDescriptionRepair ? presetDescription : undefined,
        scoaAccountId: needsScoaAccountUpdate ? scoaAccountId : undefined,
        updatedBy: updatedBy ?? null,
      });

      if (updatedPreset) {
        const updatedWithDetails: EntityDistributionPresetWithDetailsRow = {
          ...updatedPreset,
          presetDetails: existingPreset.presetDetails ?? [],
        };
        presetMetadata.set(updatedWithDetails.presetGuid, updatedWithDetails);
        presetLookup.set(cacheKey, updatedWithDetails.presetGuid);
        return { created: false, preset: updatedWithDetails };
      }
    }

    presetLookup.set(cacheKey, existingPreset.presetGuid);
    return { created: false, preset: existingPreset };
  }

  const presetInput = {
    entityId,
    presetType: distributionType,
    presetDescription,
    scoaAccountId,
    metric: null,
    presetGuid: targetPresetGuid,
  };

  const created = await createEntityDistributionPreset(presetInput);
  if (!created) {
    throw new Error('Unable to create distribution preset');
  }

  const newPreset: EntityDistributionPresetWithDetailsRow = {
    ...created,
    presetDetails: [],
  };
  presetLookup.set(cacheKey, created.presetGuid);
  presetMetadata.set(created.presetGuid, newPreset);

  return { created: true, preset: newPreset };
};

const syncPresetDetails = async (
  presetGuid: string,
  targetDetails: EntityDistributionPresetDetailInput[],
  existingDetails: EntityDistributionPresetDetailRow[],
  updatedBy: string | null,
): Promise<void> => {
  const desiredMap = new Map<string, EntityDistributionPresetDetailInput>();
  targetDetails.forEach(detail =>
    desiredMap.set(createDetailKey(detail.operationCd, detail.basisDatapoint), detail),
  );

  const toDelete: EntityDistributionPresetDetailRow[] = [];
  const toUpdate: EntityDistributionPresetDetailInput[] = [];

  existingDetails.forEach(detail => {
    const key = createDetailKey(detail.operationCd, detail.basisDatapoint);
    const candidate = desiredMap.get(key);

    if (!candidate) {
      toDelete.push(detail);
      return;
    }

    const existingPct = detail.specifiedPct ?? null;
    const targetPct = candidate.specifiedPct ?? null;
    const existingCalculated = detail.isCalculated ?? null;
    const targetCalculated = candidate.isCalculated ?? null;

    if (existingPct !== targetPct || existingCalculated !== targetCalculated) {
      toUpdate.push(candidate);
    }

    desiredMap.delete(key);
  });

  const toCreate = Array.from(desiredMap.values());

  await Promise.all(
    toDelete.map(detail =>
      deleteEntityDistributionPresetDetail(
        presetGuid,
        detail.operationCd,
        detail.basisDatapoint ?? null,
      ),
    ),
  );

  await Promise.all(
    toUpdate.map(detail =>
      updateEntityDistributionPresetDetail(
        presetGuid,
        detail.operationCd,
        {
          specifiedPct: detail.specifiedPct,
          isCalculated: detail.isCalculated,
          updatedBy,
          basisDatapoint: detail.basisDatapoint ?? null,
        },
        detail.basisDatapoint ?? null,
      ),
    ),
  );

  if (toCreate.length) {
    await createEntityDistributionPresetDetails(toCreate);
  }
};

const saveHandler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  const startedAt = Date.now();
  try {
    const payload = buildRequestPayload(await readJson(request));
    const entityId = normalizeText(payload.entityId);
    if (!entityId) {
      return json({ message: 'entityId is required' }, 400);
    }

    const rows = (payload.items ?? [])
      .map(row => ({
        ...row,
        scoaAccountId: row.scoaAccountId,
        distributionType: row.distributionType,
      }))
      .filter(
        row =>
          Boolean(normalizeText(row.scoaAccountId)) &&
          Boolean(normalizeDistributionType(row.distributionType)),
      );

    if (!rows.length) {
      return json({ items: [], message: 'No distribution rows to save' });
    }

    const { result: saveResult, queryCount } = await withQueryTracking(async () => {
      const existingPresets = await listEntityDistributionPresetsWithDetails(entityId);
      const existingDistributions = await listEntityScoaDistributions(entityId);

      // Build presetMetadata map keyed by preset GUID (like mapping does)
      const presetMetadata = new Map<string, EntityDistributionPresetWithDetailsRow>();
      // Build presetLookup map from account key to preset GUID
      const presetLookup = new Map<string, string>();
      const distributionLookup = new Map<string, EntityScoaDistributionRow>();

      existingPresets.forEach(preset => {
        // Store preset by GUID for lookup
        presetMetadata.set(preset.presetGuid, preset);
        // Also store mapping from account to GUID
        const key = normalizePresetKey(entityId, preset.scoaAccountId);
        presetLookup.set(key, preset.presetGuid);
      });

      existingDistributions.forEach(distribution => {
        const key = normalizePresetKey(entityId, distribution.scoaAccountId);
        distributionLookup.set(key, distribution);
      });

      const savedItems: DistributionSaveResult[] = [];

      for (const row of rows) {
        const normalizedScoa = normalizeText(row.scoaAccountId) as string;
        const normalizedType = normalizeDistributionType(row.distributionType);
        if (!normalizedType) {
          continue;
        }
        const key = normalizePresetKey(entityId, normalizedScoa);
        const existingDistribution = distributionLookup.get(key);

        // Resolve preset GUID: use provided GUID, fallback to existing account's GUID, or generate new
        const requestedPresetGuid = normalizeText(row.presetGuid);
        const existingPresetGuidForAccount = presetLookup.get(key);
        const resolvedPresetGuid =
          existingPresetGuidForAccount ??
          requestedPresetGuid ??
          crypto.randomUUID();

        // Look up existing preset by GUID (not by account key)
        const existingPresetByGuid = presetMetadata.get(resolvedPresetGuid);

        const presetDescription = row.presetDescription ?? normalizedScoa;

        let detailInputs = buildDetailInputs(
          row.operations,
          resolvedPresetGuid,
          normalizedType,
          row.updatedBy ?? null,
        );

        // Get current details from the preset found by GUID
        const currentDetails = existingPresetByGuid?.presetDetails ?? [];
        const detailsUnchanged = areDetailInputsEqual(currentDetails, detailInputs);

        const normalizedStatus = normalizeDistributionStatus(row.distributionStatus);
        const normalizedExistingDistributionType = normalizeDistributionType(
          existingDistribution?.distributionType,
        );

        // Use ensurePreset to create or update the preset (like mapping does)
        const { preset: currentPreset } = await ensurePreset(
          entityId,
          normalizedScoa,
          normalizedType,
          resolvedPresetGuid,
          presetDescription,
          presetLookup,
          presetMetadata,
          row.updatedBy ?? null,
        );

        const effectivePresetGuid = currentPreset.presetGuid;
        if (effectivePresetGuid !== resolvedPresetGuid) {
          presetLookup.set(key, effectivePresetGuid);
          presetMetadata.set(effectivePresetGuid, currentPreset);
          detailInputs = detailInputs.map(detail => ({
            ...detail,
            presetGuid: effectivePresetGuid,
          }));
        }

        const distributionChanged =
          normalizedExistingDistributionType !== normalizedType ||
          normalizeDistributionStatus(existingDistribution?.distributionStatus) !==
            normalizedStatus ||
          (existingDistribution?.presetGuid ?? null) !== effectivePresetGuid;

        // Sync preset details if they've changed
        if (!detailsUnchanged) {
          await syncPresetDetails(
            effectivePresetGuid,
            detailInputs,
            currentPreset.presetDetails ?? [],
            row.updatedBy ?? null,
          );

          // Update the cached preset details
          currentPreset.presetDetails = detailInputs.map(detail => ({
            ...detail,
            insertedDttm: null,
            updatedDttm: null,
          }));
        }

        // Handle distribution record (ENTITY_SCOA_DISTRIBUTION)
        let nextDistribution: EntityScoaDistributionRow | null =
          existingDistribution ?? null;

        if (distributionChanged) {
          if (
            existingDistribution &&
            normalizedExistingDistributionType === normalizedType
          ) {
            nextDistribution = await updateEntityScoaDistribution(
              entityId,
              normalizedScoa,
              normalizedType,
              {
                presetGuid: effectivePresetGuid,
                distributionStatus: normalizedStatus,
                updatedBy: row.updatedBy ?? null,
              },
            );
          } else {
            if (existingDistribution) {
              await deleteEntityScoaDistribution(entityId, normalizedScoa);
            }

            const distributionInput: EntityScoaDistributionInput = {
              entityId,
              scoaAccountId: normalizedScoa,
              distributionType: normalizedType,
              presetGuid: effectivePresetGuid,
              distributionStatus: normalizedStatus,
              updatedBy: row.updatedBy ?? null,
            };

            const createdDistributions = await insertEntityScoaDistributions([
              distributionInput,
            ]);

            nextDistribution =
              createdDistributions[0] ?? ({
                ...distributionInput,
                insertedDttm: null,
                updatedDttm: null,
              } satisfies EntityScoaDistributionRow);
          }
        }

        if (nextDistribution) {
          distributionLookup.set(key, nextDistribution);
        }

        savedItems.push({
          scoaAccountId: normalizedScoa,
          presetGuid: effectivePresetGuid,
          distributionType: normalizedType,
          distributionStatus: normalizedStatus,
        });
      }

      return { savedItems };
    });

    const durationMs = Date.now() - startedAt;
    context.log('Saved entity distributions', {
      rows: saveResult.savedItems.length,
      entityId,
      queryCount,
      durationMs,
    });

    return json({ items: saveResult.savedItems });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const queryCount = (error as { queryCount?: number })?.queryCount ?? 0;
    context.error('Failed to save entity distributions', {
      durationMs,
      queryCount,
      error,
    });
    return json(buildErrorResponse('Failed to save entity distributions', error), 500);
  }
};

app.http('entityDistributions-save', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'entityDistributions',
  handler: saveHandler,
});

export { saveHandler };
export default saveHandler;
