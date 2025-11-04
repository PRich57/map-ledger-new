import { CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';

interface ConnectionStatusProps {
  isConnected: boolean;
  serviceName?: string;
}

export default function ConnectionStatus({ isConnected, serviceName = 'QuickBooks' }: ConnectionStatusProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center space-x-4">
          {isConnected ? (
            <>
              <div className="flex-shrink-0">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-900">Connected</h3>
                <p className="text-sm text-gray-500">Your {serviceName} account is connected</p>
              </div>
            </>
          ) : (
            <>
              <div className="flex-shrink-0">
                <XCircle className="h-8 w-8 text-gray-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-900">Not Connected</h3>
                <p className="text-sm text-gray-500">Complete the setup to connect</p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}