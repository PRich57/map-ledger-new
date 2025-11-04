import { Buffer } from 'buffer';
import type { Request, Response, NextFunction } from 'express';

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string; // usually email
  userRoles: string[];
  claims?: { typ: string; val: string }[];
}

export function getClientPrincipalFromHeaders(headers: Record<string, string | string[] | undefined>): ClientPrincipal | null {
  const header = headers['x-ms-client-principal'];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(decoded) as ClientPrincipal;
  } catch {
    return null;
  }
}

export function attachClientPrincipal(req: Request, _res: Response, next: NextFunction) {
  const cp = getClientPrincipalFromHeaders(req.headers as any);
  (req as any).clientPrincipal = cp;
  next();
}
