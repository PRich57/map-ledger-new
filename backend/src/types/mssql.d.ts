declare module 'mssql' {
  export interface PoolOptions {
    max?: number;
    min?: number;
    idleTimeoutMillis?: number;
  }

  export interface ConnectionOptions {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
    enableArithAbort?: boolean;
  }

  export interface config {
    connectionString?: string;
    server?: string;
    database?: string;
    user?: string;
    password?: string;
    driver?: string;
    pool?: PoolOptions;
    options?: ConnectionOptions;
  }

  export interface IResult<TRecord> {
    recordset: TRecord[];
  }

  export interface Request {
    input(name: string, value: unknown): Request;
    query<TRecord>(query: string): Promise<IResult<TRecord>>;
  }

  export class ConnectionPool {
    constructor(config: config);
    connect(): Promise<ConnectionPool>;
    request(): Request;
    close(): Promise<void>;
    on(event: 'error', listener: (error: Error) => void): this;
  }

  const sql: {
    ConnectionPool: typeof ConnectionPool;
  };

  export default sql;
}
