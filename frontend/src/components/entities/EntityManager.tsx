import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import { useClientStore } from '../../store/clientStore';
import { useClientEntityStore } from '../../store/clientEntityStore';
import type { ClientEntity } from '../../types';

interface EntityFormState {
  entityId?: string;
  entityName: string;
  entityDisplayName: string;
  entityStatus: 'ACTIVE' | 'INACTIVE';
}

interface EntityFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialState: EntityFormState;
  onClose: () => void;
  onSubmit: (state: EntityFormState) => Promise<void>;
}

const EntityFormModal: React.FC<EntityFormModalProps> = ({
  isOpen,
  mode,
  initialState,
  onClose,
  onSubmit,
}) => {
  const [formState, setFormState] = useState<EntityFormState>(initialState);

  useEffect(() => {
    setFormState(initialState);
  }, [initialState]);

  if (!isOpen) {
    return null;
  }

  const handleChange = (
    field: keyof EntityFormState,
    value: string | 'ACTIVE' | 'INACTIVE',
  ) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit(formState);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'create' ? 'Add entity' : 'Edit entity'}
    >
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? 'Add Entity' : 'Edit Entity'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-gray-500 hover:text-gray-700"
            aria-label="Close entity modal"
          >
            Close
          </button>
        </header>
        <form className="space-y-4 px-6 py-5" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label htmlFor="entityName" className="block text-sm font-medium text-gray-700">
              Entity Name
            </label>
            <input
              id="entityName"
              name="entityName"
              required
              value={formState.entityName}
              onChange={(event) => handleChange('entityName', event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter entity name"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="entityDisplayName" className="block text-sm font-medium text-gray-700">
              Display Name (optional)
            </label>
            <input
              id="entityDisplayName"
              name="entityDisplayName"
              value={formState.entityDisplayName}
              onChange={(event) => handleChange('entityDisplayName', event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Defaults to entity name when left blank"
            />
            <p className="text-xs text-gray-500">
              Leave blank to reuse the entity name as the display name.
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-700">Status</legend>
            <div className="flex items-center space-x-4">
              <label className="inline-flex items-center space-x-2">
                <input
                  type="radio"
                  name="entityStatus"
                  value="ACTIVE"
                  checked={formState.entityStatus === 'ACTIVE'}
                  onChange={() => handleChange('entityStatus', 'ACTIVE')}
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
              <label className="inline-flex items-center space-x-2">
                <input
                  type="radio"
                  name="entityStatus"
                  value="INACTIVE"
                  checked={formState.entityStatus === 'INACTIVE'}
                  onChange={() => handleChange('entityStatus', 'INACTIVE')}
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Inactive</span>
              </label>
            </div>
          </fieldset>

          <div className="flex justify-end space-x-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {mode === 'create' ? 'Add Entity' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

const defaultFormState: EntityFormState = {
  entityId: undefined,
  entityName: '',
  entityDisplayName: '',
  entityStatus: 'ACTIVE',
};

const statusClassNames: Record<'ACTIVE' | 'INACTIVE', string> = {
  ACTIVE: 'bg-green-100 text-green-800 ring-green-200',
  INACTIVE: 'bg-yellow-100 text-yellow-800 ring-yellow-200',
};

const EntityManager: React.FC = () => {
  const clients = useClientStore((state) => state.clients);
  const activeClientId = useClientStore((state) => state.activeClientId);
  const setActiveClientId = useClientStore((state) => state.setActiveClientId);
  const entitiesByClient = useClientEntityStore((state) => state.entitiesByClient);
  const fetchForClient = useClientEntityStore((state) => state.fetchForClient);
  const createEntity = useClientEntityStore((state) => state.createEntity);
  const updateEntity = useClientEntityStore((state) => state.updateEntity);
  const deleteEntity = useClientEntityStore((state) => state.deleteEntity);
  const isLoading = useClientEntityStore((state) => state.isLoading);
  const error = useClientEntityStore((state) => state.error);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formState, setFormState] = useState<EntityFormState>(defaultFormState);

  const activeClientEntities = useMemo<ClientEntity[]>(
    () => entitiesByClient[activeClientId ?? ''] ?? [],
    [activeClientId, entitiesByClient],
  );

  useEffect(() => {
    if (activeClientId) {
      fetchForClient(activeClientId).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch client entities', err);
      });
    }
  }, [activeClientId, fetchForClient]);

  const openCreateModal = () => {
    setFormState(defaultFormState);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const openEditModal = (entity: ClientEntity) => {
    setFormState({
      entityId: entity.id,
      entityName: entity.entityName || entity.name,
      entityDisplayName: entity.displayName || '',
      entityStatus: entity.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    });
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleSubmit = async (state: EntityFormState) => {
    if (!activeClientId) {
      return;
    }

    const payload = {
      clientId: activeClientId,
      entityName: state.entityName,
      entityDisplayName: state.entityDisplayName.trim() || undefined,
      entityStatus: state.entityStatus,
    };

    if (modalMode === 'create') {
      await createEntity(payload);
    } else if (state.entityId) {
      await updateEntity({ ...payload, entityId: state.entityId });
    }

    setIsModalOpen(false);
  };

  const handleDelete = async (entityId: string) => {
    if (!activeClientId) {
      return;
    }

    const confirmed = window.confirm('Are you sure you want to delete this entity?');
    if (!confirmed) {
      return;
    }

    await deleteEntity(activeClientId, entityId);
  };

  const renderStatusBadge = (entity: ClientEntity) => {
    const status = entity.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusClassNames[status]}`}
      >
        {status === 'ACTIVE' ? 'Active' : 'Inactive'}
      </span>
    );
  };

  return (
    <section className="space-y-4" aria-label="Entity manager">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Entities</h2>
          <p className="text-sm text-gray-600">Manage client entities and their status.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <label className="text-sm text-gray-700" htmlFor="entity-client-selector">
            Client
          </label>
          <select
            id="entity-client-selector"
            value={activeClientId ?? ''}
            onChange={(event) => setActiveClientId(event.target.value || null)}
            className="min-w-[200px] rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {clients.length === 0 && <option value="">No clients available</option>}
            {clients.map((client) => (
              <option key={client.clientId} value={client.clientId}>
                {client.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="primary" onClick={openCreateModal} disabled={!activeClientId}>
            <Plus className="mr-2 h-4 w-4" /> Add Entity
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                Name
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                Display Name
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {activeClientId && activeClientEntities.length === 0 && !isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-600">
                  No entities found for this client.
                </td>
              </tr>
            )}
            {activeClientEntities.map((entity) => (
              <tr key={entity.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{entity.entityName || entity.name}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                  {entity.displayName || entity.name}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">{renderStatusBadge(entity)}</td>
                <td className="px-4 py-3 text-right text-sm">
                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => openEditModal(entity)}
                      className="flex items-center"
                    >
                      <Pencil className="mr-1 h-4 w-4" aria-hidden />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => handleDelete(entity.id)}
                      className="flex items-center"
                    >
                      <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-600">
                  Loading entities...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EntityFormModal
        isOpen={isModalOpen}
        mode={modalMode}
        initialState={formState}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </section>
  );
};

export default EntityManager;
