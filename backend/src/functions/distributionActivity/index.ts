import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { normalizeGlMonth } from '../../utils/glMonth';
import {
  replaceOperationScoaActivity,
  type OperationScoaActivityInput,
} from '../../repositories/operationScoaActivityRepository';
import { replaceClientGlData, type ClientGlDataInput } from '../../repositories/clientGlDataRepository';
import {
  upsertEntityScoaActivity,
  type EntityScoaActivityInput,
} from '../../repositories/entityScoaActivityRepository';

interface DistributionActivityEntryPayload {
  operationCd?: string | null;
  scoaAccountId?: string | null;
  glMonth?: string | null;
  glValue?: number | null;
}

interface DistributionActivityRequest {
  entityId?: string | null;
  updatedBy?: string | null;
  entries?: DistributionActivityEntryPayload[];
}

const normalizeText = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildEntries = (
  payload: DistributionActivityEntryPayload[],
  updatedBy: string | null,
): OperationScoaActivityInput[] => {
  const mappedEntries = payload.map<OperationScoaActivityInput | null>(entry => {
    const operationCd = normalizeText(entry.operationCd);
    const scoaAccountId = normalizeText(entry.scoaAccountId);
    const glMonth = normalizeGlMonth(entry.glMonth ?? '');
    const glValue = Number(entry.glValue ?? NaN);
    if (!operationCd || !scoaAccountId || !glMonth || !Number.isFinite(glValue)) {
      return null;
    }
    const result: OperationScoaActivityInput = {
      operationCd,
      scoaAccountId,
      activityMonth: glMonth,
      activityValue: glValue,
      updatedBy,
    };
    return result;
  });

  return mappedEntries.filter((entry): entry is OperationScoaActivityInput => entry !== null);
};

const activityHandler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  const startedAt = Date.now();
  try {
    const payload = (await readJson(request)) as DistributionActivityRequest;
    const entityId = normalizeText(payload.entityId);
    if (!entityId) {
      return json({ message: 'entityId is required' }, 400);
    }
    const updatedBy = normalizeText(payload.updatedBy);
    const entries = buildEntries(payload.entries ?? [], updatedBy);
    if (!entries.length) {
      return json({ message: 'No valid activity entries provided' }, 400);
    }

    await replaceOperationScoaActivity(entries);
    const clientGlDataPayload: ClientGlDataInput[] = entries.map(entry => ({
      operationCd: entry.operationCd,
      glId: entry.scoaAccountId,
      glMonth: entry.activityMonth,
      glValue: entry.activityValue,
    }));
    const entityActivityTotals = entries.reduce<Map<string, EntityScoaActivityInput>>(
      (accumulator, entry) => {
        const key = `${entry.scoaAccountId}|||${entry.activityMonth}`;
        const existing = accumulator.get(key);
        if (existing) {
          existing.activityValue += entry.activityValue;
          return accumulator;
        }
        accumulator.set(key, {
          entityId,
          scoaAccountId: entry.scoaAccountId,
          activityMonth: entry.activityMonth,
          activityValue: entry.activityValue,
          updatedBy,
        });
        return accumulator;
      },
      new Map(),
    );

    await Promise.all([
      replaceClientGlData(clientGlDataPayload),
      upsertEntityScoaActivity(Array.from(entityActivityTotals.values())),
    ]);

    const durationMs = Date.now() - startedAt;
    context.log('Persisted distribution activity', {
      rows: entries.length,
      entityId,
      durationMs,
    });

    return json({ message: 'Distribution activity persisted', rows: entries.length });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    context.error('Failed to persist distribution activity', {
      durationMs,
      error,
    });
    return json(buildErrorResponse('Failed to persist distribution activity', error), 500);
  }
};

app.http('distributionActivity-persist', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'distributionActivity',
  handler: activityHandler,
});

export default activityHandler;
