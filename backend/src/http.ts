import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import { Buffer } from 'buffer';

export function json(body: unknown, status: number = 200): HttpResponseInit {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  };
}

export async function readJson<T = any>(req: HttpRequest): Promise<T | null> {
  try {
    const b: unknown = (req as any).body;

    if (b == null) return null;

    if (typeof b === 'string') {
      return JSON.parse(b) as T;
    }

    if (Buffer.isBuffer(b)) {
      return JSON.parse((b as Buffer).toString('utf8')) as T;
    }

    if (b instanceof Uint8Array) {
      return JSON.parse(Buffer.from(b).toString('utf8')) as T;
    }

    if (typeof b === 'object') {
      // already parsed JSON body
      return b as T;
    }

    return null;
  } catch {
    return null;
  }
}

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string; // typically email
  userRoles: string[];
  claims?: { typ: string; val: string }[];
}

export function getClientPrincipal(req: HttpRequest): ClientPrincipal | null {
  const headersAny: any = (req as any).headers;

  // Support both classic Functions header bag (has .get) and plain objects
  const raw: string | undefined =
    typeof headersAny?.get === 'function'
      ? headersAny.get('x-ms-client-principal')
      : headersAny?.['x-ms-client-principal'] ?? headersAny?.['X-MS-CLIENT-PRINCIPAL'];

  if (!raw) return null;

  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(decoded) as ClientPrincipal;
  } catch {
    return null;
  }
}
