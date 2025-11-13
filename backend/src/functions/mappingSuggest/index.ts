import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json } from '../../http';

export async function mappingSuggestHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.warn('mapping/suggest endpoint not implemented');
  return json({ message: 'mapping/suggest endpoint not implemented' }, 501);
}

app.http('mappingSuggest', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'mapping/suggest',
  handler: mappingSuggestHandler
});

export default mappingSuggestHandler;
