import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import { deleteEntityMappingPresetDetailsByIds } from '../../repositories/entityMappingPresetDetailRepository';

const parseRecordId = (request: HttpRequest, body: unknown): number | null => {
  const queryValue = request.query.get('recordId');
  const candidate = queryValue ?? (body as { recordId?: unknown })?.recordId;
  if (candidate === undefined || candidate === null) {
    return null;
  }
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const deleteHandler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson(request).catch(() => null);
    const recordId = parseRecordId(request, body);
    if (!recordId) {
      return json({ message: 'recordId is required' }, 400);
    }

    const deleted = await deleteEntityMappingPresetDetailsByIds([recordId]);
    if (!deleted) {
      return json({ message: 'Record not found' }, 404);
    }

    return json({ deleted });
  } catch (error) {
    context.error('Failed to delete preset detail', error);
    return json({ message: 'Failed to delete preset detail' }, 500);
  }
};

app.http('entityMappingPresetDetails-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'entityMappingPresetDetails',
  handler: deleteHandler,
});

export default deleteHandler;
