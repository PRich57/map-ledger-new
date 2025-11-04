import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import StatusBadge from './StatusBadge';

interface IntegrationCardProps {
  name: string;
  description: string;
  status: 'available' | 'coming_soon' | 'beta';
  icon: LucideIcon;
  id: string;
}

export default function IntegrationCard({
  name,
  description,
  status,
  icon: Icon,
  id,
}: IntegrationCardProps) {
  const isDisabled = status === 'coming_soon';

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center">
            <Icon className="h-6 w-6 text-gray-600" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900">{name}</h3>
            {status !== 'available' && <StatusBadge status={status} />}
          </div>
        </div>
      </div>
      <div className="px-6 py-4">
        <p className="text-sm text-gray-500 mb-4">{description}</p>
        {isDisabled ? (
          <button
            disabled
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
          >
            Coming Soon
          </button>
        ) : (
          <Link
            to={`/integrations/${id}`}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full justify-center"
          >
            Connect
            <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}