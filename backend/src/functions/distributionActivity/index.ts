import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { normalizeGlMonth } from '../../utils/glMonth';
import {
  replaceOperationScoaActivity,
  type OperationScoaActivityInput,
} from '../../repositories/operationScoaActivityRepository';
import { replaceClientGlData, type ClientGlDataInput } from '../../repositories/clientGlDataRepository';

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
    const entries = buildEntries(payload.entries ?? [], normalizeText(payload.updatedBy));
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
    await replaceClientGlData(clientGlDataPayload);

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
