import { useState } from 'react';
import { 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  KeyRound,
  RefreshCw,
  Building2,
  Download,
  Upload,
  Settings 
} from 'lucide-react';
import { Link } from 'react-router-dom';
import ConnectionStatus from '../../components/integrations/ConnectionStatus';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import Input from '../../components/ui/Input';

interface SageCompany {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
  lastSync?: string;
}

interface SageCredentials {
  companyId: string;
  userId: string;
  password: string;
}

export default function SageIntacct() {
  const [isConnected, setIsConnected] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [credentials, setCredentials] = useState<SageCredentials>({
    companyId: '',
    userId: '',
    password: '',
  });

  const [syncSettings, setSyncSettings] = useState({
    frequency: 'daily',
    historicalData: '3',
    syncAllCompanies: true,
    syncDimensions: true,
    autoMapDimensions: true,
    consolidateCompanies: true,
    emailNotifications: true
  });

  const [companies, setCompanies] = useState<SageCompany[]>([
    {
      id: '1',
      name: 'Main Operations',
      code: 'MAIN',
      enabled: true,
      lastSync: new Date().toISOString()
    },
    {
      id: '2',
      name: 'West Coast Division',
      code: 'WEST',
      enabled: true,
      lastSync: new Date().toISOString()
    },
    {
      id: '3',
      name: 'East Coast Division',
      code: 'EAST',
      enabled: false
    }
  ]);

  const handleConnect = () => {
    if (!credentials.companyId || !credentials.userId || !credentials.password) {
      return;
    }
    
    // Simulate API connection
    setTimeout(() => {
      setIsConnected(true);
      setCurrentStep(2);
    }, 1500);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    // Simulate sync process
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsSyncing(false);
    // Update last sync time for the selected company
    setCompanies(prev => prev.map(company =>
      company.code === selectedCompany
        ? { ...company, lastSync: new Date().toISOString() }
        : company
    ));
  };

  const handleToggleCompany = (companyId: string) => {
    setCompanies(prev => prev.map(company =>
      company.id === companyId
        ? { ...company, enabled: !company.enabled }
        : company
    ));
  };

  const handleAction = (action: string) => {
    const actions = {
      'Export Configuration': () => {
        setTimeout(() => {
          alert('Configuration exported successfully! (Demo only)');
        }, 500);
      },
      'Import Configuration': () => {
        const confirmed = window.confirm('This will override existing company configurations. Continue? (Demo only)');
        if (confirmed) {
          setTimeout(() => {
            alert('Configuration imported successfully! (Demo only)');
          }, 500);
        }
      },
      'Advanced Settings': () => {
        alert('Advanced company settings will be available in a future update. (Demo only)');
      }
    };

    const actionKey = action as keyof typeof actions;
    actions[actionKey]?.();
  };

  return (
    <div className="py-6 space-y-6">
      <div className="flex items-center space-x-4">
        <Link
          to="/integrations"
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sage Intacct Integration</h1>
          <p className="mt-1 text-sm text-gray-500">
            Connect and sync your Sage Intacct account with MapLedger
          </p>
        </div>
        {isConnected && selectedCompany && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="ml-auto inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="animate-spin h-4 w-4 mr-2" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Company
              </>
            )}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-medium text-gray-900">Setup Wizard</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                <div className="flex items-start">
                  <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                    currentStep >= 1 ? 'bg-blue-600' : 'bg-gray-200'
                  }`}>
                    <span className="text-sm font-medium text-white">1</span>
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="text-sm font-medium text-gray-900">Connect your Sage Intacct account</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Enter your Sage Intacct credentials to authorize MapLedger.
                    </p>
                    {currentStep === 1 && !isConnected && (
                      <div className="mt-4 space-y-4">
                        <Input
                          label="Company ID"
                          value={credentials.companyId}
                          onChange={(e) => setCredentials(prev => ({ ...prev, companyId: e.target.value }))}
                          placeholder="Enter your Company ID"
                        />
                        <Input
                          label="User ID"
                          value={credentials.userId}
                          onChange={(e) => setCredentials(prev => ({ ...prev, userId: e.target.value }))}
                          placeholder="Enter your User ID"
                        />
                        <Input
                          label="Password"
                          type="password"
                          value={credentials.password}
                          onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                          placeholder="Enter your password"
                        />
                        <button
                          onClick={handleConnect}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <KeyRound className="h-4 w-4 mr-2" />
                          Connect Sage Intacct
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-start">
                  <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                    currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-200'
                  }`}>
                    <span className="text-sm font-medium text-white">2</span>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-sm font-medium text-gray-900">Configure companies</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Select which companies to sync and configure their settings.
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                    currentStep >= 3 ? 'bg-blue-600' : 'bg-gray-200'
                  }`}>
                    <span className="text-sm font-medium text-white">3</span>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-sm font-medium text-gray-900">Map your accounts</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Match your Sage Intacct accounts and dimensions with MapLedger's chart of accounts.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {isConnected && (
            <>
              <Card>
                <CardHeader>
                  <h2 className="text-lg font-medium text-gray-900">Company Management</h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      {companies.map(company => (
                        <div
                          key={company.id}
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center space-x-4">
                            <Building2 className="h-5 w-5 text-gray-400" />
                            <div>
                              <h3 className="text-sm font-medium text-gray-900">{company.name}</h3>
                              <p className="text-xs text-gray-500">Code: {company.code}</p>
                              {company.lastSync && (
                                <p className="text-xs text-gray-500">
                                  Last synced: {new Date(company.lastSync).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                            <div className="flex items-center">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="sr-only peer"
                                  checked={company.enabled}
                                  onChange={() => handleToggleCompany(company.id)}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                              </label>
                            </div>
                            <button
                              onClick={() => setSelectedCompany(company.code)}
                              className={`px-3 py-1 rounded-md text-sm font-medium ${
                                selectedCompany === company.code
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              Configure
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="text-lg font-medium text-gray-900">Sync Settings</h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-900">Auto-sync frequency</label>
                        <p className="text-sm text-gray-500 mb-2">How often should we sync your data?</p>
                        <select 
                          value={syncSettings.frequency}
                          onChange={(e) => setSyncSettings(prev => ({ ...prev, frequency: e.target.value }))}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        >
                          <option value="daily">Daily</option>
                          <option value="hourly">Hourly</option>
                          <option value="manual">Manual</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-900">Historical data</label>
                        <p className="text-sm text-gray-500 mb-2">Import data from previous periods</p>
                        <select
                          value={syncSettings.historicalData}
                          onChange={(e) => setSyncSettings(prev => ({ ...prev, historicalData: e.target.value }))}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        >
                          <option value="3">Last 3 months</option>
                          <option value="6">Last 6 months</option>
                          <option value="12">Last 12 months</option>
                          <option value="all">All available data</option>
                        </select>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-sm font-medium text-gray-900 mb-4">Company Options</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="relative flex items-start">
                          <div className="flex items-center h-5">
                            <input
                              type="checkbox"
                              checked={syncSettings.syncAllCompanies}
                              onChange={(e) => setSyncSettings(prev => ({
                                ...prev,
                                syncAllCompanies: e.target.checked
                              }))}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </div>
                          <div className="ml-3 text-sm">
                            <span className="font-medium text-gray-900">Sync all companies</span>
                            <p className="text-gray-500">Keep all companies in sync</p>
                          </div>
                        </label>

                        <label className="relative flex items-start">
                          <div className="flex items-center h-5">
                            <input
                              type="checkbox"
                              checked={syncSettings.syncDimensions}
                              onChange={(e) => setSyncSettings(prev => ({ 
                                ...prev, 
                                syncDimensions: e.target.checked 
                              }))}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </div>
                          <div className="ml-3 text-sm">
                            <span className="font-medium text-gray-900">Sync dimensions</span>
                            <p className="text-gray-500">Include Sage Intacct dimensions</p>
                          </div>
                        </label>

                        <label className="relative flex items-start">
                          <div className="flex items-center h-5">
                            <input
                              type="checkbox"
                              checked={syncSettings.autoMapDimensions}
                              onChange={(e) => setSyncSettings(prev => ({ 
                                ...prev, 
                                autoMapDimensions: e.target.checked 
                              }))}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </div>
                          <div className="ml-3 text-sm">
                            <span className="font-medium text-gray-900">Auto-map dimensions</span>
                            <p className="text-gray-500">Automatically map dimension codes</p>
                          </div>
                        </label>

                        <label className="relative flex items-start">
                          <div className="flex items-center h-5">
                            <input
                              type="checkbox"
                              checked={syncSettings.consolidateCompanies}
                              onChange={(e) => setSyncSettings(prev => ({
                                ...prev,
                                consolidateCompanies: e.target.checked
                              }))}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </div>
                          <div className="ml-3 text-sm">
                            <span className="font-medium text-gray-900">Consolidate companies</span>
                            <p className="text-gray-500">Enable consolidated reporting</p>
                          </div>
                        </label>

                        <label className="relative flex items-start">
                          <div className="flex items-center h-5">
                            <input
                              type="checkbox"
                              checked={syncSettings.emailNotifications}
                              onChange={(e) => setSyncSettings(prev => ({ 
                                ...prev, 
                                emailNotifications: e.target.checked 
                              }))}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </div>
                          <div className="ml-3 text-sm">
                            <span className="font-medium text-gray-900">Email notifications</span>
                            <p className="text-gray-500">Receive sync status updates</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="text-lg font-medium text-gray-900">Actions</h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <button 
                      onClick={() => handleAction('Export Configuration')}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 w-full transition-colors duration-200"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export Company Configuration
                    </button>
                    <button 
                      onClick={() => handleAction('Import Configuration')}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 w-full transition-colors duration-200"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Import Company Configuration
                    </button>
                    <button 
                      onClick={() => handleAction('Advanced Settings')}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 w-full transition-colors duration-200"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Advanced Company Settings
                    </button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="lg:col-span-1 space-y-6">
          <ConnectionStatus 
            isConnected={isConnected}
            serviceName="Sage Intacct"
          />

          <Card>
            <CardHeader>
              <h2 className="text-lg font-medium text-gray-900">Integration Info</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Data Synced</h3>
                  <ul className="mt-2 space-y-2">
                    <li className="flex items-center text-sm text-gray-600">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
                      Chart of Accounts
                    </li>
                    <li className="flex items-center text-sm text-gray-600">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
                      Journal Entries
                    </li>
                    <li className="flex items-center text-sm text-gray-600">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
                      Trial Balance
                    </li>
                    <li className="flex items-center text-sm text-gray-600">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
                      Dimensions
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-900">Requirements</h3>
                  <ul className="mt-2 space-y-2">
                    <li className="flex items-center text-sm text-gray-600">
                      <AlertCircle className="h-4 w-4 text-blue-500 mr-2" />
                      Sage Intacct account
                    </li>
                    <li className="flex items-center text-sm text-gray-600">
                      <AlertCircle className="h-4 w-4 text-blue-500 mr-2" />
                      Company ID & credentials
                    </li>
                    <li className="flex items-center text-sm text-gray-600">
                      <AlertCircle className="h-4 w-4 text-blue-500 mr-2" />
                      Web Services enabled
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}