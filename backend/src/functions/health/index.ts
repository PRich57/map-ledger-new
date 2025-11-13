import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json } from '../../http';

export async function healthHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Health check invoked');
  return json({ ok: true, uptime: process.uptime() });
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler
});

export default healthHandler;
