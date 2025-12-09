import EntityManager from '../components/entities/EntityManager';

export default function Clients() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-1">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Admin</p>
        <h1 className="text-2xl font-semibold text-gray-900">Client Profiles & Entities</h1>
        <p className="text-sm text-gray-600">
          Manage client entities, display names, and statuses. Deleted entities are hidden from selection lists.
        </p>
      </header>

      <EntityManager />
    </div>
  );
}
