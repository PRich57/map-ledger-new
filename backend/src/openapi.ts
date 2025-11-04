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
    '/user-clients': {
      get: { summary: 'List clients available to the current user' }
    },
    '/datapoint-configs': {
      get: { summary: 'List saved datapoint configurations' },
      post: { summary: 'Create a new datapoint configuration' },
      put: { summary: 'Update an existing datapoint configuration' }
    }
  }
};

export default openApiSpec;
