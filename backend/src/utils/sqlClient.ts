import sql, { ConnectionPool, config as SqlConfig, IResult } from 'mssql';

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
  return {
    server, database, user, password,
    options: { encrypt, trustServerCertificate: trust, enableArithAbort: true },
    pool: { max: toInt(process.env.SQL_POOL_MAX, 10), min: toInt(process.env.SQL_POOL_MIN, 0), idleTimeoutMillis: toInt(process.env.SQL_POOL_IDLE_TIMEOUT, 30000) }
  } as SqlConfig;
};

export const getSqlPool = async (): Promise<ConnectionPool> => {
  if (!connectionPromise) {
    const cfg = resolveSqlConfig();
    connectionPromise = new sql.ConnectionPool(cfg).connect().then(pool => {
      pool.on('error', err => { console.error('[sql] pool error', err); connectionPromise = null; });
      return pool;
    }).catch(e => { connectionPromise = null; throw e; });
  }
  return connectionPromise;
};

export const runQuery = async <TRecord = Record<string, unknown>>(query: string, parameters: Record<string, unknown> = {}): Promise<IResult<TRecord>> => {
  const pool = await getSqlPool();
  const request = pool.request();
  for (const [name, value] of Object.entries(parameters)) request.input(name, value as any);
  return request.query<TRecord>(query);
};

export default { getSqlPool, runQuery };
