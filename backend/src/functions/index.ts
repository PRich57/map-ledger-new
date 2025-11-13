import { app } from '@azure/functions';

import './aiGenerate';
import './dbPing';
import './glUpload';
import './health';
import './industries';
import './mappingSuggest';
import './masterclients';
import './userClients';
import './datapointConfigs/create';
import './datapointConfigs/list';
import './datapointConfigs/update';

export default app;
