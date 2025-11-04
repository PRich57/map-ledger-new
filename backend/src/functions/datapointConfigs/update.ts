import { Request, Response } from 'express';
import {
  DatapointConfigurationUpdate,
  updateDatapointConfiguration,
} from '../../repositories/datapointConfigurationRepository';
import { sanitizePayload } from './utils';

const buildUpdatePayload = (
  body: Record<string, unknown>,
  paramsId?: string
): DatapointConfigurationUpdate => ({
  id:
    typeof body.id === 'string'
      ? body.id.trim()
      : paramsId
      ? paramsId.trim()
      : '',
  ...sanitizePayload(body),
});

export default async function updateDatapointConfigs(
  req: Request,
  res: Response
) {
  try {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ message: 'Missing request body' });
      return;
    }

    const payload = buildUpdatePayload(
      req.body as Record<string, unknown>,
      typeof req.params.id === 'string' ? req.params.id : undefined
    );

    if (!payload.id) {
      res.status(400).json({ message: 'id is required for updates' });
      return;
    }

    if (!payload.userEmail || !payload.clientId || !payload.clientName) {
      res.status(400).json({ message: 'userEmail, clientId, and clientName are required' });
      return;
    }

    const updated = await updateDatapointConfiguration({
      ...payload,
      userEmail: payload.userEmail.toLowerCase(),
    });

    res.json(updated);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to update datapoint configuration', error);
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ message: 'Datapoint configuration not found' });
      return;
    }
    res.status(500).json({ message: 'Failed to update datapoint configuration' });
  }
}
