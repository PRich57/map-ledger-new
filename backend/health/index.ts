import type { HttpRequest, InvocationContext } from '@azure/functions';
import { json } from '../src/http';

export default async function (_req: HttpRequest, _ctx: InvocationContext) {
  return json({ ok: true, uptime: process.uptime() });
}
