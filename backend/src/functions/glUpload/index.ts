import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json } from '../../http';

export async function glUploadHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.warn('glUpload endpoint not implemented');
  return json({ message: 'gl/upload endpoint not implemented' }, 501);
}

app.http('glUpload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'gl/upload',
  handler: glUploadHandler
});

export default glUploadHandler;
