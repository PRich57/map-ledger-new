const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'MapLedger API',
    version: '0.1.0'
  },
  paths: {
    '/industries': {
      get: { summary: 'List industries' }
    },
    '/masterclients': {
      get: { summary: 'List master clients' }
    },
    '/gl/upload': {
      post: { summary: 'Upload GL file' }
    },
    '/mapping/suggest': {
      get: { summary: 'Suggest account mapping' }
    },
    '/distribution/suggest': {
      get: { summary: 'Suggest SCOA distributions for an entity' }
    },
    '/chart-of-accounts': {
      get: { summary: 'List chart of accounts' }
    },
    '/user-clients': {
      get: { summary: 'List clients available to the current user' }
    },
    '/db-ping': {
      get: { summary: 'Ping the SQL database and return connectivity diagnostics' }
    },
    '/datapoint-configs': {
      get: { summary: 'List saved datapoint configurations' },
      post: { summary: 'Create a new datapoint configuration' },
      put: { summary: 'Update an existing datapoint configuration' }
    },
    '/client-files': {
      get: { summary: 'List paginated client file metadata' },
      post: { summary: 'Persist client file metadata and sheet/entity details' }
    },
    '/client-entities': {
      get: { summary: 'List entities configured for a client' }
    },
    '/client-header-mappings': {
      get: { summary: 'List saved client header mappings for a client' },
      post: { summary: 'Create or update client header mappings' },
      put: { summary: 'Replace client header mappings for specific template headers' }
    },
    '/file-records': {
      get: { summary: 'List ingested file records for a file upload' }
    },
    '/file-records/ingest': {
      post: { summary: 'Ingest mapped file records for a file upload' }
    },
    '/distributionActivity': {
      post: { summary: 'Persist SCOA activity entries for operations' }
    }
  }
};

export default openApiSpec;
