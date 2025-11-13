import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json } from '../../http';

export async function industriesHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.warn('industries endpoint not implemented');
  return json({ message: 'industries endpoint not implemented' }, 501);
}

app.http('industries', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'industries',
  handler: industriesHandler
});

export default industriesHandler;
