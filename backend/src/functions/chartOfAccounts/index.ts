import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json } from '../../http';
import listChartOfAccounts from '../../repositories/chartOfAccountsRepository';

export async function chartOfAccountsHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const accounts = await listChartOfAccounts();
    return json({ accounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    context.error('Failed to list chart of accounts', error);
    return json({ message: 'Unable to fetch chart of accounts', detail: message }, 500);
  }
}

app.http('chartOfAccounts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'chart-of-accounts',
  handler: chartOfAccountsHandler
});

export default chartOfAccountsHandler;
