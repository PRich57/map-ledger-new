import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import {
  IndustryNotFoundError,
  InvalidIndustryNameError,
  InvalidIndustryTableError,
  listIndustryCoaRows,
  updateIndustryCostType,
  updateIndustryCostTypeBatch,
} from '../../repositories/coaManagerRepository';
import { getFirstStringValue } from '../../utils/requestParsers';

const COA_MANAGER_COLUMNS = [
  { key: 'accountNumber', label: 'Account' },
  { key: 'accountName', label: 'Name' },
  { key: 'category', label: 'Category' },
  { key: 'department', label: 'Department' },
  { key: 'costType', label: 'Cost Type' },
];

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
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
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
    const rows = await listIndustryCoaRows(industry);
    return json({ columns: COA_MANAGER_COLUMNS, rows });
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

export default getIndustryCoaHandler;
