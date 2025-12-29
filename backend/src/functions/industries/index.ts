import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import {
  createIndustry,
  IndustryAlreadyExistsError,
  listIndustries,
} from '../../repositories/industriesRepository';
import { getFirstStringValue } from '../../utils/requestParsers';

export async function listIndustriesHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const industries = await listIndustries();
    return json({ industries: industries.map((industry) => industry.name) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    context.error('Failed to list industries', error);
    return json({ message: 'Unable to fetch industries', detail: message }, 500);
  }
}

export async function createIndustryHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const payload = (await readJson<Record<string, unknown>>(request)) ?? {};
  const name = getFirstStringValue(payload.name ?? payload.industry ?? payload.industryName);

  if (!name) {
    return json({ message: 'name is required' }, 400);
  }

  try {
    const created = await createIndustry(name);
    return json({ name: created.name }, 201);
  } catch (error) {
    if (error instanceof IndustryAlreadyExistsError) {
      return json({ message: error.message, code: error.code }, 409);
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    context.error('Failed to create industry', error);
    return json({ message: 'Unable to create industry', detail: message }, 500);
  }
}

app.http('industries-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'industries',
  handler: listIndustriesHandler
});

app.http('industries-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'industries',
  handler: createIndustryHandler
});

export default listIndustriesHandler;
