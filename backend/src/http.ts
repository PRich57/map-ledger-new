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
    const requestWithJson = req as HttpRequest & { json?: () => Promise<unknown> };
    if (typeof requestWithJson.json === 'function') {
      return (await requestWithJson.json()) as T;
    }

    const b: unknown = (req as any).body;

    if (b == null) {
      const requestWithText = req as HttpRequest & { text?: () => Promise<string> };
      if (typeof requestWithText.text === 'function') {
        const raw = await requestWithText.text();
        return raw ? (JSON.parse(raw) as T) : null;
      }

      return null;
    }

    if (typeof b === 'string') {
      return JSON.parse(b) as T;
    }

    if (Buffer.isBuffer(b)) {
      return JSON.parse((b as Buffer).toString('utf8')) as T;
    }

    if (b instanceof Uint8Array) {
      return JSON.parse(Buffer.from(b).toString('utf8')) as T;
    }

    const maybeReadable = b as {
      getReader?: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> };
    };
    if (typeof maybeReadable?.getReader === 'function') {
      const reader = maybeReadable.getReader();
      const chunks: Uint8Array[] = [];

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
        }
      }

      if (chunks.length === 0) {
        return null;
      }

      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
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
