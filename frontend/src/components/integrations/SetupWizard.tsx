import { ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../ui/Card';

interface SetupWizardProps {
  currentStep: number;
  onConnect: () => void;
  isConnected: boolean;
}

export default function SetupWizard({ currentStep, onConnect, isConnected }: SetupWizardProps) {
  return (
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
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Connect your QuickBooks account</h3>
              <p className="mt-1 text-sm text-gray-500">
                Click the connect button to authorize MapLedger to access your QuickBooks data.
              </p>
              {currentStep === 1 && !isConnected && (
                <button
                  onClick={onConnect}
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Connect QuickBooks
                  <ExternalLink className="ml-2 h-4 w-4" />
                </button>
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
              <h3 className="text-sm font-medium text-gray-900">Configure sync settings</h3>
              <p className="mt-1 text-sm text-gray-500">
                Choose how often you want to sync data and what historical data to import.
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
                Match your QuickBooks accounts with MapLedger's chart of accounts.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}