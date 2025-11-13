import { Buffer } from 'buffer';
type HeadersLike = Record<string, string | string[] | undefined> & {
  get?: (key: string) => string | null | undefined;
};

type RequestLike = { headers: HeadersLike } & Record<string, unknown>;

type NextFunctionLike = (...args: unknown[]) => void;

const getFirstHeaderString = (
  headers: Record<string, string | string[] | undefined> | HeadersLike,
  key: string
): string | undefined => {
  const bag = headers as HeadersLike;
  if (typeof bag.get === 'function') {
    const viaGet = bag.get(key);
    if (typeof viaGet === 'string' && viaGet.length > 0) {
      return viaGet;
    }
  }

  const record = headers as Record<string, string | string[] | undefined>;
  const candidates = [key, key.toLowerCase(), key.toUpperCase()];
  for (const candidateKey of candidates) {
    const value = record[candidateKey];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string' && entry.length > 0) {
          return entry;
        }
      }
    }
  }

  return undefined;
};

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string; // usually email
  userRoles: string[];
  claims?: { typ: string; val: string }[];
}

export function getClientPrincipalFromHeaders(
  headers: Record<string, string | string[] | undefined> | HeadersLike
): ClientPrincipal | null {
  const raw = getFirstHeaderString(headers, 'x-ms-client-principal');
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(decoded) as ClientPrincipal;
  } catch {
    return null;
  }
}

export function attachClientPrincipal(req: RequestLike, _res: unknown, next: NextFunctionLike) {
  const cp = getClientPrincipalFromHeaders(req.headers as HeadersLike);
  (req as any).clientPrincipal = cp;
  next();
}
