import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle,
  Download,
  Upload,
  Settings,
  RefreshCw
} from 'lucide-react';
import ConnectionStatus from '../../components/integrations/ConnectionStatus';
import SetupWizard from '../../components/integrations/SetupWizard';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import type { ConnectionStatus as ConnectionStatusType } from '../../types';

export default function QuickBooks() {
  const [isConnected, setIsConnected] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSettings, setSyncSettings] = useState({
    frequency: 'daily',
    historicalData: '3',
    autoSync: true,
    syncBalanceSheet: true,
    autoMap: true,
    emailNotifications: true
  });
  const [connectionDetails, setConnectionDetails] = useState<ConnectionStatusType>({
    connected: false,
    company: undefined,
    environment: undefined,
    lastSync: undefined,
  });

  const handleConnect = () => {
    // Simulate OAuth flow
    setTimeout(() => {
      setIsConnected(true);
      setCurrentStep(2);
      setConnectionDetails({
        connected: true,
        company: 'Sample Company Inc.',
        environment: 'Production',
        lastSync: new Date().toISOString()
      });
    }, 1500);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    // Simulate sync process
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsSyncing(false);
    setConnectionDetails(prev => ({
      ...prev,
      lastSync: new Date().toISOString()
    }));
  };

  const handleAction = (action: string) => {
    const actions = {
      'Export Configuration': () => {
        // Simulate export process
        setTimeout(() => {
          alert('Configuration exported successfully! (Demo only)');
        }, 500);
      },
      'Import Configuration': () => {
        // Simulate import process
        const confirmed = window.confirm('This will override your existing configuration. Continue? (Demo only)');
        if (confirmed) {
          setTimeout(() => {
            alert('Configuration imported successfully! (Demo only)');
          }, 500);
        }
      },
      'Advanced Settings': () => {
        alert('Advanced settings will be available in a future update. (Demo only)');
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
          <h1 className="text-2xl font-semibold text-gray-900">QuickBooks Online Integration</h1>
          <p className="mt-1 text-sm text-gray-500">
            Connect and sync your QuickBooks Online account with MapLedger
          </p>
        </div>
        {isConnected && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="ml-auto inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="animate-spin h-4 w-4 mr-2" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Now
              </>
            )}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SetupWizard
            currentStep={currentStep}
            onConnect={handleConnect}
            isConnected={isConnected}
          />

          {isConnected && (
            <>
              <Card>
                <CardHeader>
                  <h2 className="text-lg font-medium text-gray-900">Connection Details</h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Company</label>
                        <p className="mt-1 text-sm text-gray-900">{connectionDetails.company}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Environment</label>
                        <p className="mt-1 text-sm text-gray-900">{connectionDetails.environment}</p>
                      </div>
                      {connectionDetails.lastSync && (
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Last Synced</label>
                          <p className="mt-1 text-sm text-gray-900">
                            {new Date(connectionDetails.lastSync).toLocaleString()}
                          </p>
                        </div>
                      )}
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
                      <h3 className="text-sm font-medium text-gray-900 mb-4">Sync Options</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="relative flex items-start">
                          <div className="flex items-center h-5">
                            <input
                              type="checkbox"
                              checked={syncSettings.autoSync}
                              onChange={(e) => setSyncSettings(prev => ({ 
                                ...prev, 
                                autoSync: e.target.checked 
                              }))}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </div>
                          <div className="ml-3 text-sm">
                            <span className="font-medium text-gray-900">Automatic sync</span>
                            <p className="text-gray-500">Keep data in sync automatically</p>
                          </div>
                        </label>

                        <label className="relative flex items-start">
                          <div className="flex items-center h-5">
                            <input
                              type="checkbox"
                              checked={syncSettings.syncBalanceSheet}
                              onChange={(e) => setSyncSettings(prev => ({ 
                                ...prev, 
                                syncBalanceSheet: e.target.checked 
                              }))}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </div>
                          <div className="ml-3 text-sm">
                            <span className="font-medium text-gray-900">Balance sheet accounts</span>
                            <p className="text-gray-500">Include balance sheet accounts</p>
                          </div>
                        </label>

                        <label className="relative flex items-start">
                          <div className="flex items-center h-5">
                            <input
                              type="checkbox"
                              checked={syncSettings.autoMap}
                              onChange={(e) => setSyncSettings(prev => ({ 
                                ...prev, 
                                autoMap: e.target.checked 
                              }))}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </div>
                          <div className="ml-3 text-sm">
                            <span className="font-medium text-gray-900">Auto-mapping</span>
                            <p className="text-gray-500">Automatically map new accounts</p>
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
                      Export Mapping Configuration
                    </button>
                    <button 
                      onClick={() => handleAction('Import Configuration')}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 w-full transition-colors duration-200"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Import Mapping Configuration
                    </button>
                    <button 
                      onClick={() => handleAction('Advanced Settings')}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 w-full transition-colors duration-200"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Advanced Settings
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
            serviceName="QuickBooks Online"
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
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-900">Requirements</h3>
                  <ul className="mt-2 space-y-2">
                    <li className="flex items-center text-sm text-gray-600">
                      <AlertCircle className="h-4 w-4 text-blue-500 mr-2" />
                      QuickBooks Online account
                    </li>
                    <li className="flex items-center text-sm text-gray-600">
                      <AlertCircle className="h-4 w-4 text-blue-500 mr-2" />
                      Admin access rights
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