import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import {
  IndustryNotFoundError,
  InvalidIndustryNameError,
  InvalidIndustryTableError,
  listIndustryCoaData,
  updateIndustryIsFinancial,
  updateIndustryIsFinancialBatch,
  updateIndustryCostType,
  updateIndustryCostTypeBatch,
} from '../../repositories/coaManagerRepository';
import { getFirstStringValue } from '../../utils/requestParsers';

const resolveIndustryParam = (request: HttpRequest): string | undefined => {
  const params = request.params as Partial<{ industry?: string }> | undefined;
  return getFirstStringValue(params?.industry);
};

const normalizeCostType = (value: unknown): string | null | undefined => {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return undefined;
};

const normalizeIsFinancial = (value: unknown): boolean | null | undefined => {
  if (value === null) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = trimmed.toLowerCase();
    if (
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 'yes' ||
      normalized === 'y' ||
      normalized.includes('financial') ||
      normalized === 'fin' ||
      normalized.startsWith('fin')
    ) {
      return true;
    }
    if (
      normalized === 'false' ||
      normalized === '0' ||
      normalized === 'no' ||
      normalized === 'n' ||
      normalized.includes('operational') ||
      normalized === 'ops' ||
      normalized.startsWith('oper')
    ) {
      return false;
    }
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return undefined;
  }
  return undefined;
};

const parseRowIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => getFirstStringValue(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const handleIndustryError = (
  error: unknown,
  context: InvocationContext,
  action: string,
): HttpResponseInit => {
  if (error instanceof InvalidIndustryNameError) {
    return json({ message: error.message }, 400);
  }
  if (error instanceof IndustryNotFoundError) {
    return json({ message: error.message }, 404);
  }
  if (error instanceof InvalidIndustryTableError) {
    return json({ message: error.message }, 400);
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  context.error(`Failed to ${action}`, error);
  return json({ message: `Unable to ${action}`, detail: message }, 500);
};

export async function getIndustryCoaHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const industry = resolveIndustryParam(request);
  if (!industry) {
    return json({ message: 'industry is required' }, 400);
  }

  try {
    const data = await listIndustryCoaData(industry);
    return json(data);
  } catch (error) {
    return handleIndustryError(error, context, 'fetch COA data');
  }
}

export async function updateIndustryCostTypeHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const industry = resolveIndustryParam(request);
  if (!industry) {
    return json({ message: 'industry is required' }, 400);
  }

  const payload = (await readJson<Record<string, unknown>>(request)) ?? {};
  const rowId = getFirstStringValue(payload.rowId ?? payload.recordId ?? payload.id);
  const costType = normalizeCostType(payload.costType);

  if (!rowId || costType === undefined) {
    return json({ message: 'rowId and costType are required' }, 400);
  }

  try {
    const updated = await updateIndustryCostType(industry, rowId, costType);
    if (!updated) {
      return json({ message: 'Record not found' }, 404);
    }
    return json({ ok: true });
  } catch (error) {
    return handleIndustryError(error, context, 'update cost type');
  }
}

export async function updateIndustryCostTypeBatchHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const industry = resolveIndustryParam(request);
  if (!industry) {
    return json({ message: 'industry is required' }, 400);
  }

  const payload = (await readJson<Record<string, unknown>>(request)) ?? {};
  const rowIds = parseRowIds(payload.rowIds ?? payload.recordIds);
  const costType = normalizeCostType(payload.costType);

  if (rowIds.length === 0 || costType === undefined) {
    return json({ message: 'rowIds and costType are required' }, 400);
  }

  try {
    const updatedCount = await updateIndustryCostTypeBatch(industry, rowIds, costType);
    return json({ updated: updatedCount });
  } catch (error) {
    return handleIndustryError(error, context, 'update cost types');
  }
}

export async function updateIndustryIsFinancialHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const industry = resolveIndustryParam(request);
  if (!industry) {
    return json({ message: 'industry is required' }, 400);
  }

  const payload = (await readJson<Record<string, unknown>>(request)) ?? {};
  const rowId = getFirstStringValue(payload.rowId ?? payload.recordId ?? payload.id);
  const isFinancial = normalizeIsFinancial(payload.isFinancial);

  if (!rowId || isFinancial === undefined) {
    return json({ message: 'rowId and isFinancial are required' }, 400);
  }

  try {
    const updated = await updateIndustryIsFinancial(industry, rowId, isFinancial);
    if (!updated) {
      return json({ message: 'Record not found' }, 404);
    }
    return json({ ok: true });
  } catch (error) {
    return handleIndustryError(error, context, 'update financial flag');
  }
}

export async function updateIndustryIsFinancialBatchHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const industry = resolveIndustryParam(request);
  if (!industry) {
    return json({ message: 'industry is required' }, 400);
  }

  const payload = (await readJson<Record<string, unknown>>(request)) ?? {};
  const rowIds = parseRowIds(payload.rowIds ?? payload.recordIds);
  const isFinancial = normalizeIsFinancial(payload.isFinancial);

  if (rowIds.length === 0 || isFinancial === undefined) {
    return json({ message: 'rowIds and isFinancial are required' }, 400);
  }

  try {
    const updatedCount = await updateIndustryIsFinancialBatch(industry, rowIds, isFinancial);
    return json({ updated: updatedCount });
  } catch (error) {
    return handleIndustryError(error, context, 'update financial flags');
  }
}

app.http('coaManager-industry', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'coa-manager/industry/{industry}',
  handler: getIndustryCoaHandler,
});

app.http('coaManager-costType', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'coa-manager/industry/{industry}/cost-type',
  handler: updateIndustryCostTypeHandler,
});

app.http('coaManager-costType-batch', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'coa-manager/industry/{industry}/cost-type/batch',
  handler: updateIndustryCostTypeBatchHandler,
});

app.http('coaManager-isFinancial', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'coa-manager/industry/{industry}/is-financial',
  handler: updateIndustryIsFinancialHandler,
});

app.http('coaManager-isFinancial-batch', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'coa-manager/industry/{industry}/is-financial/batch',
  handler: updateIndustryIsFinancialBatchHandler,
});

export default getIndustryCoaHandler;
