import { Request, Response } from 'express';
import { listDatapointConfigurations } from '../../repositories/datapointConfigurationRepository';
import { getFirstStringValue } from '../../utils/requestParsers';

export default async function listDatapointConfigs(req: Request, res: Response) {
  try {
    const emailParam = req.query.email ?? req.headers['x-user-email'];
    const clientIdParam = req.query.clientId ?? req.query.client_id;

    const email = getFirstStringValue(emailParam);

    if (!email) {
      res.status(400).json({ message: 'Missing email query parameter' });
      return;
    }

    const clientId = getFirstStringValue(clientIdParam);

    const configs = await listDatapointConfigurations(
      email.toLowerCase(),
      clientId
    );
    res.json({ items: configs });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load datapoint configurations', error);
    res.status(500).json({ message: 'Failed to load datapoint configurations' });
  }
}
