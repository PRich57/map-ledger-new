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
                  return {
                    operationCd: code.toUpperCase(),
                    allocation:
                      allocation !== null ? Math.max(0, Math.min(100, allocation)) : null,
                    notes: normalizeText(opRecord.notes),
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

const buildDetailInputs = (
  operations: DistributionSaveOperationPayload[] | undefined,
  presetGuid: string,
  type: DistributionType,
  updatedBy: string | null,
): EntityDistributionPresetDetailInput[] => {
  if (!operations || operations.length === 0) {
    return [];
  }
  return operations
    .map(
      (operation): EntityDistributionPresetDetailInput | null => {
        const code = normalizeText(operation.operationCd);
        if (!code) {
          return null;
        }
        return {
          presetGuid,
          operationCd: code.toUpperCase(),
          isCalculated: type === 'dynamic' ? true : null,
          specifiedPct:
            operation.allocation !== undefined && operation.allocation !== null
              ? Math.max(0, Math.min(100, operation.allocation))
              : null,
          updatedBy,
        };
      },
    )
    .filter(
      (detail): detail is EntityDistributionPresetDetailInput => Boolean(detail),
  );
};

const areDetailInputsEqual = (
  current: EntityDistributionPresetDetailRow[],
  target: EntityDistributionPresetDetailInput[],
): boolean => {
  if (current.length !== target.length) {
    return false;
  }

  const currentMap = new Map<string, { pct: number | null; isCalculated: boolean | null }>();

  current.forEach(detail => {
    const key = detail.operationCd.toUpperCase();
    currentMap.set(key, {
      pct: detail.specifiedPct ?? null,
      isCalculated: detail.isCalculated ?? null,
    });
  });

  return target.every(detail => {
    const key = detail.operationCd.toUpperCase();
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

const syncPresetDetails = async (
  presetGuid: string,
  targetDetails: EntityDistributionPresetDetailInput[],
  existingDetails: EntityDistributionPresetDetailRow[],
  updatedBy: string | null,
): Promise<void> => {
  const desiredMap = new Map<string, EntityDistributionPresetDetailInput>();
  targetDetails.forEach(detail => {
    desiredMap.set(detail.operationCd, detail);
  });

  const toDelete: string[] = [];
  const toUpdate: EntityDistributionPresetDetailInput[] = [];

  existingDetails.forEach(detail => {
    const candidate = desiredMap.get(detail.operationCd);
    if (!candidate) {
      toDelete.push(detail.operationCd);
      return;
    }

    const existingPct = detail.specifiedPct ?? null;
    const targetPct = candidate.specifiedPct ?? null;
    const existingCalculated = detail.isCalculated ?? null;
    const targetCalculated = candidate.isCalculated ?? null;

    if (
      existingPct !== targetPct ||
      existingCalculated !== targetCalculated
    ) {
      toUpdate.push(candidate);
    }

    desiredMap.delete(detail.operationCd);
  });

  const toCreate = Array.from(desiredMap.values());

  await Promise.all(
    toDelete.map(operationCd =>
      deleteEntityDistributionPresetDetail(presetGuid, operationCd),
    ),
  );

  await Promise.all(
    toUpdate.map(detail =>
      updateEntityDistributionPresetDetail(presetGuid, detail.operationCd, {
        specifiedPct: detail.specifiedPct,
        isCalculated: detail.isCalculated,
        updatedBy,
      }),
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
      const presetLookup = new Map<string, EntityDistributionPresetWithDetailsRow>();
      const distributionLookup = new Map<string, EntityScoaDistributionRow>();

      existingPresets.forEach(preset => {
        const key = normalizePresetKey(entityId, preset.scoaAccountId);
        presetLookup.set(key, preset);
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
        const existingPreset = presetLookup.get(key);
        const existingDistribution = distributionLookup.get(key);
        const resolvedPresetGuid =
          normalizeText(row.presetGuid) ??
          existingPreset?.presetGuid ??
          crypto.randomUUID();

        const presetDescription = row.presetDescription ?? normalizedScoa;
        const presetInput = {
          entityId,
          presetType: normalizedType,
          presetDescription,
          scoaAccountId: normalizedScoa,
          metric: null,
          presetGuid: resolvedPresetGuid,
        };

        const detailInputs = buildDetailInputs(
          row.operations,
          resolvedPresetGuid,
          normalizedType,
          row.updatedBy ?? null,
        );

        const currentDetails =
          existingPreset?.presetGuid === resolvedPresetGuid
            ? existingPreset?.presetDetails ?? []
            : [];
        const detailsUnchanged = areDetailInputsEqual(currentDetails, detailInputs);

        const presetNeedsUpdate =
          !existingPreset ||
          existingPreset.presetGuid !== resolvedPresetGuid ||
          existingPreset.presetType !== normalizedType ||
          (existingPreset.presetDescription ?? null) !== (presetDescription ?? null) ||
          existingPreset.scoaAccountId !== normalizedScoa;

        const normalizedStatus = normalizeDistributionStatus(row.distributionStatus);
        const normalizedExistingDistributionType = normalizeDistributionType(
          existingDistribution?.distributionType,
        );
        const distributionChanged =
          normalizedExistingDistributionType !== normalizedType ||
          normalizeDistributionStatus(existingDistribution?.distributionStatus) !==
            normalizedStatus ||
          (existingDistribution?.presetGuid ?? null) !== resolvedPresetGuid;

        if (!presetNeedsUpdate && detailsUnchanged && !distributionChanged) {
          savedItems.push({
            scoaAccountId: normalizedScoa,
            presetGuid: resolvedPresetGuid,
            distributionType: normalizedType,
            distributionStatus: normalizedStatus,
          });
          continue;
        }

        const presetRow =
          existingPreset && existingPreset.presetGuid === resolvedPresetGuid
            ? await updateEntityDistributionPreset(resolvedPresetGuid, {
                presetType: normalizedType,
                presetDescription,
                scoaAccountId: normalizedScoa,
                updatedBy: row.updatedBy ?? null,
              })
            : await createEntityDistributionPreset(presetInput);

        if (!presetRow) {
          throw new Error('Unable to persist distribution preset');
        }

        const nextPreset: EntityDistributionPresetWithDetailsRow = {
          ...presetRow,
          presetDetails: detailInputs.map(detail => ({
            ...detail,
            insertedDttm: null,
            updatedDttm: null,
          })),
        };
        presetLookup.set(key, nextPreset);

        if (!detailsUnchanged) {
          await syncPresetDetails(
            resolvedPresetGuid,
            detailInputs,
            existingPreset?.presetDetails ?? [],
            row.updatedBy ?? null,
          );
        }

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
                presetGuid: resolvedPresetGuid,
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
              presetGuid: resolvedPresetGuid,
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
          presetGuid: resolvedPresetGuid,
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
