import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import MappingHeader from '../components/mapping/MappingHeader';
import StepTabs, { MappingStep } from '../components/mapping/StepTabs';
import SummaryCards from '../components/mapping/SummaryCards';
import MappingTable from '../components/mapping/MappingTable';
import DistributionTable from '../components/mapping/DistributionTable';
import ReconcilePane from '../components/mapping/ReconcilePane';
import ReviewPane from '../components/mapping/ReviewPane';
import MappingMonthHelper from '../components/mapping/MappingMonthHelper';
import EntityTabs from '../components/mapping/EntityTabs';
import {
  selectActiveEntityId,
  selectAvailableEntities,
  type HydrationMode,
  useMappingStore,
} from '../store/mappingStore';
import { useOrganizationStore } from '../store/organizationStore';
import { useClientStore } from '../store/clientStore';
import { useAuthStore } from '../store/authStore';
import scrollPageToTop from '../utils/scroll';

const normalizeEntityId = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const stepParam = (value: string | null): MappingStep => {
  if (value === 'reconcile' || value === 'distribution' || value === 'review') {
    return value;
  }
  return 'mapping';
};

const resolveHydrationMode = (value: string | null): HydrationMode => {
  if (value === 'restart' || value === 'none') {
    return value;
  }
  return 'resume';
};

export default function Mapping() {
  const { uploadId = 'demo' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const userEmail = useAuthStore(state => state.user?.email ?? null);
  const hydrateClients = useClientStore(state => state.hydrateFromAccessList);
  const clientAccess = useOrganizationStore(state => state.clientAccess);
  const fetchOrganizations = useOrganizationStore(state => state.fetchForUser);
  const activeClientId = useClientStore(state => state.activeClientId);
  const activeUploadId = useMappingStore(state => state.activeUploadId);
  const availableEntities = useMappingStore(selectAvailableEntities);
  const activeEntityId = useMappingStore(selectActiveEntityId);
  const [entityStages, setEntityStages] = useState<Record<string, MappingStep>>({});
  const activeStep = useMemo(() => {
    if (activeEntityId && entityStages[activeEntityId]) {
      return entityStages[activeEntityId];
    }
    return stepParam(searchParams.get('stage'));
  }, [activeEntityId, entityStages, searchParams]);
  const setActiveEntityId = useMappingStore(state => state.setActiveEntityId);
  const fetchFileRecords = useMappingStore(state => state.fetchFileRecords);
  const setMappingActiveClientId = useMappingStore(state => state.setActiveClientId);
  const hydrationMode = useMemo(
    () => resolveHydrationMode(searchParams.get('mode')),
    [searchParams],
  );
  const availableEntityIds = useMemo(
    () => new Set(availableEntities.map(entity => entity.id)),
    [availableEntities],
  );

  useEffect(() => {
    if (!userEmail) {
      return;
    }

    if (clientAccess.length > 0) {
      return;
    }

    fetchOrganizations(userEmail);
  }, [clientAccess.length, fetchOrganizations, userEmail]);

  useEffect(() => {
    if (clientAccess.length === 0) {
      return;
    }

    hydrateClients(clientAccess, activeClientId);
  }, [activeClientId, clientAccess, hydrateClients]);

  useEffect(() => {
    setMappingActiveClientId(activeClientId ?? null);
  }, [activeClientId, setMappingActiveClientId]);
  const normalizedEntityParam = useMemo(() => {
    const param = searchParams.get('entityId');
    const normalized = normalizeEntityId(param);
    if (!normalized) {
      return null;
    }
    return availableEntityIds.has(normalized) ? normalized : null;
  }, [availableEntityIds, searchParams]);

  useEffect(() => {
    if (activeStep === 'mapping') {
      scrollPageToTop({ behavior: 'auto' });
    }
  }, [activeStep]);

  useEffect(() => {
    if (!uploadId) {
      return;
    }

    const shouldReload = uploadId !== activeUploadId || hydrationMode === 'restart';
    if (shouldReload) {
      fetchFileRecords(uploadId, { hydrateMode: hydrationMode, clientId: activeClientId });

      if (hydrationMode === 'restart') {
        const next = new URLSearchParams(searchParams);
        next.delete('mode');
        setSearchParams(next, { replace: true });
      }
    }
  }, [
    activeClientId,
    activeUploadId,
    fetchFileRecords,
    hydrationMode,
    searchParams,
    setSearchParams,
    uploadId,
  ]);

  useEffect(() => {
    if (availableEntities.length === 0) {
      return;
    }

    const fallbackEntityId =
      normalizedEntityParam ??
      (activeEntityId && availableEntityIds.has(activeEntityId)
        ? activeEntityId
        : null) ??
      availableEntities[0]?.id ??
      null;

    if (fallbackEntityId !== activeEntityId) {
      setActiveEntityId(fallbackEntityId);
    }
  }, [
    activeEntityId,
    availableEntities,
    availableEntityIds,
    normalizedEntityParam,
    setActiveEntityId,
  ]);

  useEffect(() => {
    if (!activeEntityId) {
      return;
    }

    const stageFromParams = stepParam(searchParams.get('stage'));
    setEntityStages(prev => {
      if (prev[activeEntityId] === stageFromParams) {
        return prev;
      }
      return { ...prev, [activeEntityId]: stageFromParams };
    });
  }, [activeEntityId, searchParams]);

  useEffect(() => {
    if (!activeEntityId) {
      return;
    }

    const entityStage = entityStages[activeEntityId] ?? stepParam(searchParams.get('stage'));
    const currentEntityParam = normalizeEntityId(searchParams.get('entityId'));

    const next = new URLSearchParams(searchParams);
    let shouldUpdate = false;

    if (currentEntityParam !== activeEntityId) {
      next.set('entityId', activeEntityId);
      shouldUpdate = true;
    }

    if (searchParams.get('stage') !== entityStage) {
      next.set('stage', entityStage);
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      setSearchParams(next, { replace: true });
    }
  }, [activeEntityId, entityStages, searchParams, setSearchParams]);

  const updateStage = useCallback(
    (step: MappingStep) => {
      if (searchParams.get('stage') === step) {
        return;
      }
      const next = new URLSearchParams(searchParams);
      next.set('stage', step);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleStepChange = (step: MappingStep) => {
    if (!activeEntityId) {
      return;
    }

    setEntityStages(prev => {
      if (prev[activeEntityId] === step) {
        return prev;
      }
      return { ...prev, [activeEntityId]: step };
    });

    updateStage(step);
  };

  const resolveEntityStage = useCallback(
    (entityId: string): MappingStep => entityStages[entityId] ?? 'mapping',
    [entityStages],
  );

  const handleEntityChange = useCallback(
    (entityId: string) => {
      const nextStage = resolveEntityStage(entityId);
      setEntityStages(prev => {
        if (prev[entityId] === nextStage) {
          return prev;
        }
        return { ...prev, [entityId]: nextStage };
      });

      const next = new URLSearchParams(searchParams);
      next.set('entityId', entityId);
      next.set('stage', nextStage);
      setSearchParams(next, { replace: true });
      setActiveEntityId(entityId);
    },
    [resolveEntityStage, searchParams, setActiveEntityId, setSearchParams],
  );

  return (
    <div data-testid="mapping-page" className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <MappingHeader clientId={activeClientId ?? undefined} glUploadId={uploadId} />
      <EntityTabs
        entities={availableEntities}
        activeEntityId={activeEntityId}
        onSelect={handleEntityChange}
      />
      <SummaryCards />
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {activeStep === 'mapping' && <MappingMonthHelper />}
        <StepTabs activeStep={activeStep} onStepChange={handleStepChange} />
        <section
          aria-label="Mapping workspace content"
          className="w-full border-t border-gray-200 p-6 dark:border-slate-700"
        >
          {activeStep === 'mapping' && <MappingTable />}
          {activeStep === 'reconcile' && <ReconcilePane />}
          {activeStep === 'distribution' && <DistributionTable />}
          {activeStep === 'review' && <ReviewPane />}
        </section>
      </div>
    </div>
  );
}