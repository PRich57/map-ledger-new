import { Request, Response } from 'express';
import {
  fetchUserClientAccess,
  isUserClientFallbackAllowed,
} from '../../repositories/userClientRepository';
import { getFirstStringValue } from '../../utils/requestParsers';
import createFallbackUserClientAccess from '../../repositories/userClientRepositoryFallback';

const logPrefix = '[userClients]';

const logDebug = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  // eslint-disable-next-line no-console
  console.debug(logPrefix, ...args);
};

const logInfo = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  // eslint-disable-next-line no-console
  console.info(logPrefix, ...args);
};

const logWarn = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  // eslint-disable-next-line no-console
  console.warn(logPrefix, ...args);
};

const logError = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  // eslint-disable-next-line no-console
  console.error(logPrefix, ...args);
};

export default async function userClients(req: Request, res: Response) {
  const emailParam = req.query.email ?? req.headers['x-user-email'];
  logDebug('Received request for user clients', {
    queryEmail: req.query.email,
    headerEmail: req.headers['x-user-email'],
    originalUrl: req.originalUrl,
  });
  const email = getFirstStringValue(emailParam);

  if (!email) {
    logWarn('Missing email query parameter in user clients request');
    res.status(400).json({ message: 'Missing email query parameter' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    logWarn('Email parameter was provided but empty after trimming in user clients request');
    res.status(400).json({ message: 'Missing email query parameter' });
    return;
  }

  try {
    logInfo('Fetching user client access', { normalizedEmail });
    const data = await fetchUserClientAccess(normalizedEmail);
    logInfo('Returning user client access response', {
      normalizedEmail,
      clientCount: data.clients.length,
    });
    res.json(data);
  } catch (error) {
    logError('Failed to load user clients', error);
    if (normalizedEmail && isUserClientFallbackAllowed()) {
      logWarn(
        'Returning fallback user client access response from handler because repository lookup failed'
      );
      res.json(createFallbackUserClientAccess(normalizedEmail));
      return;
    }

    res.status(500).json({ message: 'Failed to load clients for user' });
  }
}
