import { Request, Response } from 'express';
import { createDatapointConfiguration } from '../../repositories/datapointConfigurationRepository';
import { buildErrorResponse, sanitizePayload } from './utils';

export default async function createDatapointConfigs(
  req: Request,
  res: Response
) {
  try {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ message: 'Missing request body' });
      return;
    }

    const payload = sanitizePayload(req.body as Record<string, unknown>);

    if (!payload.userEmail || !payload.clientId || !payload.clientName) {
      res.status(400).json({ message: 'userEmail, clientId, and clientName are required' });
      return;
    }

    const created = await createDatapointConfiguration({
      ...payload,
      userEmail: payload.userEmail.toLowerCase(),
    });

    res.status(201).json(created);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to create datapoint configuration', error);
    res
      .status(500)
      .json(
        buildErrorResponse(
          'Failed to create datapoint configuration',
          error
        )
      );
  }
}
