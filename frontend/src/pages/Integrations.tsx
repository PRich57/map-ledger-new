import IntegrationCard from '../components/integrations/IntegrationCard';
import { Network } from 'lucide-react';

const integrations = [
  {
    id: 'quickbooks',
    name: 'QuickBooks Online',
    description: 'Connect to QuickBooks Online for real-time GL data synchronization.',
    status: 'available',
  },
  {
    id: 'sage',
    name: 'Sage Intacct',
    description: 'Integrate with Sage Intacct for automated financial data transfer.',
    status: 'available',
  },
  {
    id: 'xero',
    name: 'Xero',
    description: 'Sync your Xero accounts and transactions automatically.',
    status: 'available',
  },
  {
    id: 'freshbooks',
    name: 'FreshBooks',
    description: 'Connect your FreshBooks account for seamless data flow.',
    status: 'coming_soon',
  },
  {
    id: 'mcleod',
    name: 'McLeod Software',
    description: 'Integrate with McLeod for transportation accounting data.',
    status: 'beta',
  },
  {
    id: 'dynamics',
    name: 'Microsoft Dynamics GP',
    description: 'Connect to Dynamics GP for enterprise-level integration.',
    status: 'coming_soon',
  },
  {
    id: 'custom',
    name: 'Custom Integration',
    description: 'Build a custom integration using our secure API.',
    status: 'available',
  },
];

export default function Integrations() {
  return (
    <div className="py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Integrations</h1>
          <p className="mt-1 text-sm text-gray-500">
            Connect your accounting systems for automated data synchronization
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((integration) => (
          <IntegrationCard
            key={integration.id}
            id={integration.id}
            name={integration.name}
            description={integration.description}
            status={integration.status as "available" | "coming_soon" | "beta"}
            icon={Network}
          />
        ))}
      </div>
    </div>
  );
}