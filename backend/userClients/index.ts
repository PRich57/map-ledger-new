import type { HttpRequest, InvocationContext } from '@azure/functions';
import { json } from '../src/http';
import { getClientPrincipal } from '../src/http';
import { fetchUserClientAccess, isUserClientFallbackAllowed } from '../src/repositories/userClientRepository';
import createFallbackUserClientAccess from '../src/repositories/userClientRepositoryFallback';

export default async function (req: HttpRequest, _ctx: InvocationContext) {
  try {
    const principal = getClientPrincipal(req);
    const email = principal?.userDetails?.toLowerCase() || '';
    if (!email) return json({ message: 'Missing user identity' }, 401);

    try {
      const data = await fetchUserClientAccess(email);
      return json(data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[userClients] repo failed; checking fallback', err);
      if (isUserClientFallbackAllowed()) {
        return json(createFallbackUserClientAccess(email));
      }
      return json({ message: 'Failed to load clients for user' }, 500);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[userClients] error', err);
    return json({ message: 'Unexpected error' }, 500);
  }
}
