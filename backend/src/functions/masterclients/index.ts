import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json } from '../../http';

export async function masterclientsHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.warn('masterclients endpoint not implemented');
  return json({ message: 'masterclients endpoint not implemented' }, 501);
}

app.http('masterclients', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'masterclients',
  handler: masterclientsHandler
});

export default masterclientsHandler;
