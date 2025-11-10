import sql, { ConnectionPool, config as SqlConfig, IResult } from 'mssql';

const logPrefix = '[sqlClient]';

const shouldLog = process.env.NODE_ENV !== 'test';

const logDebug = (...args: unknown[]) => {
  if (!shouldLog) {
    return;
  }
  // eslint-disable-next-line no-console
  console.debug(logPrefix, ...args);
};

const logInfo = (...args: unknown[]) => {
  if (!shouldLog) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info(logPrefix, ...args);
};

const logError = (...args: unknown[]) => {
  if (!shouldLog) {
    return;
  }
  // eslint-disable-next-line no-console
  console.error(logPrefix, ...args);
};

let connectionPromise: Promise<ConnectionPool> | null = null;

const toBool = (v?: string) => (typeof v === 'string' ? v.toLowerCase() === 'true' : false);
const toInt = (v: string | undefined, fallback: number) => {
  const n = Number(v); return Number.isFinite(n) ? n : fallback;
};

const resolveSqlConfig = (): SqlConfig => {
  const cs =
    process.env.SQL_CONN_STR ||
    process.env.SQL_CONNECTION_STRING ||
    process.env.SQL_CONN_STRINGS ||
    process.env.SQL_CONN_STRING;

  const encrypt = toBool(process.env.SQL_ENCRYPT ?? 'true');
  const trust = toBool(process.env.SQL_TRUST_CERT);

  if (cs) {
    logInfo('Resolved SQL configuration from connection string');
    return {
      connectionString: cs,
      options: { encrypt, trustServerCertificate: trust, enableArithAbort: true },
      pool: { max: toInt(process.env.SQL_POOL_MAX, 10), min: toInt(process.env.SQL_POOL_MIN, 0), idleTimeoutMillis: toInt(process.env.SQL_POOL_IDLE_TIMEOUT, 30000) }
    } as SqlConfig;
  }

  const { SQL_SERVER: server, SQL_DATABASE: database, SQL_USERNAME: user, SQL_PASSWORD: password } = process.env as Record<string,string>;
  if (!server || !database || !user || !password) {
    throw new Error('Missing SQL env vars. Provide SQL_CONN_STR or (SQL_SERVER, SQL_DATABASE, SQL_USERNAME, SQL_PASSWORD).');
  }
  logInfo('Resolved SQL configuration from discrete environment variables', {
    server,
    database,
    hasUser: Boolean(user),
    hasPassword: Boolean(password),
    encrypt,
    trustServerCertificate: trust,
  });

  return {
    server, database, user, password,
    options: { encrypt, trustServerCertificate: trust, enableArithAbort: true },
    pool: { max: toInt(process.env.SQL_POOL_MAX, 10), min: toInt(process.env.SQL_POOL_MIN, 0), idleTimeoutMillis: toInt(process.env.SQL_POOL_IDLE_TIMEOUT, 30000) }
  } as SqlConfig;
};

export const getSqlPool = async (): Promise<ConnectionPool> => {
  if (!connectionPromise) {
    const cfg = resolveSqlConfig();
    const startTime = Date.now();
    const connectionString = (cfg as { connectionString?: string }).connectionString;
    const server = (cfg as { server?: string }).server;
    const database = (cfg as { database?: string }).database;
    logInfo('Establishing new SQL connection pool', {
      hasConnectionString: Boolean(connectionString),
      server,
      database,
      poolMax: cfg.pool?.max,
      poolMin: cfg.pool?.min,
      idleTimeoutMillis: cfg.pool?.idleTimeoutMillis,
    });

    connectionPromise = new sql.ConnectionPool(cfg)
      .connect()
      .then((pool) => {
        const durationMs = Date.now() - startTime;
        logInfo('SQL connection pool established', { durationMs });
        pool.on('error', (err) => {
          logError('SQL connection pool encountered an error', err);
          connectionPromise = null;
        });
        return pool;
      })
      .catch((error) => {
        connectionPromise = null;
        logError('Failed to establish SQL connection pool', error);
        throw error;
      });
  } else {
    logDebug('Reusing existing SQL connection pool promise');
  }
  return connectionPromise;
};

export const runQuery = async <TRecord = Record<string, unknown>>(query: string, parameters: Record<string, unknown> = {}): Promise<IResult<TRecord>> => {
  const pool = await getSqlPool();
  const request = pool.request();
  Object.entries(parameters).forEach(([name, value]) => {
    request.input(name, value as any);
  });

  logInfo('Executing SQL query', {
    query,
    parameters,
  });

  const startTime = Date.now();
  try {
    const result = await request.query<TRecord>(query);
    const durationMs = Date.now() - startTime;
    logInfo('SQL query executed successfully', {
      durationMs,
      rowCount: result.recordset?.length ?? 0,
    });
    if (result.recordset && result.recordset.length > 0) {
      logDebug('SQL query result sample', {
        firstRow: result.recordset[0],
      });
    } else {
      logDebug('SQL query returned no rows');
    }
    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logError('SQL query failed', {
      durationMs,
      query,
      parameters,
      error,
    });
    throw error;
  }
};

export default { getSqlPool, runQuery };
