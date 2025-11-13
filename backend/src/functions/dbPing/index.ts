import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json } from '../../http';
import { runQuery } from '../../utils/sqlClient';

const shouldLog = process.env.NODE_ENV !== 'test';

const logInfo = (
  context: InvocationContext,
  message: string,
  details?: Record<string, unknown>
) => {
  if (!shouldLog) {
    return;
  }
  context.log(message, details ?? '');
};

const logError = (context: InvocationContext, message: string, details?: unknown) => {
  if (!shouldLog) {
    return;
  }
  context.error(message, details ?? '');
};

export async function dbPingHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const startedAt = Date.now();
  logInfo(context, 'Received database ping request');

  try {
    const result = await runQuery('SELECT SYSDATETIMEOFFSET() AS currentTime');
    const firstRow = result.recordset?.[0] as { currentTime?: unknown } | undefined;
    const durationMs = Date.now() - startedAt;

    logInfo(context, 'Database ping query executed successfully', {
      durationMs,
      rowCount: result.recordset?.length ?? 0
    });

    return json({
      ok: true,
      message: 'Successfully reached SQL database',
      durationMs,
      serverTimestamp: firstRow?.currentTime ?? null
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    logError(context, 'Database ping failed', {
      durationMs,
      error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });

    return json(
      {
        ok: false,
        message: 'Failed to reach SQL database',
        durationMs,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      500
    );
  }
}

app.http('dbPing', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'db-ping',
  handler: dbPingHandler
});

export default dbPingHandler;
