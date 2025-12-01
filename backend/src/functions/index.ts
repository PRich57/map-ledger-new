import { app } from '@azure/functions';

import './aiGenerate';
import './dbPing';
import './glUpload';
import './health';
import './industries';
import './chartOfAccounts';
import './mappingSuggest';
import './masterclients';
import './userClients';
import './datapointConfigs/create';
import './datapointConfigs/list';
import './datapointConfigs/update';
import './clientFiles';
import './clientEntities';
import './clientHeaderMappings';
import './fileRecords';

export default app;
