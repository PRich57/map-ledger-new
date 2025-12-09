import { useCallback, useEffect, useMemo } from 'react';
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
  const activeClientId = useMappingStore(state => state.activeClientId);
  const activeUploadId = useMappingStore(state => state.activeUploadId);
  const activeEntityId = useMappingStore(selectActiveEntityId);
  const activeStep = useMemo(() => stepParam(searchParams.get('stage')), [searchParams]);
  const setActiveEntityId = useMappingStore(state => state.setActiveEntityId);
  const availableEntities = useMappingStore(selectAvailableEntities);
  const fetchFileRecords = useMappingStore(state => state.fetchFileRecords);
  const hydrationMode = useMemo(
    () => resolveHydrationMode(searchParams.get('mode')),
    [searchParams],
  );
  const normalizedEntityParam = useMemo(() => {
    const param = searchParams.get('entityId');
    return normalizeEntityId(param);
  }, [searchParams]);

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
      fetchFileRecords(uploadId, { hydrateMode: hydrationMode });

      if (hydrationMode === 'restart') {
        const next = new URLSearchParams(searchParams);
        next.delete('mode');
        setSearchParams(next, { replace: true });
      }
    }
  }, [activeUploadId, fetchFileRecords, hydrationMode, searchParams, setSearchParams, uploadId]);

  useEffect(() => {
    if (normalizedEntityParam !== activeEntityId) {
      setActiveEntityId(normalizedEntityParam);
    }
  }, [activeEntityId, normalizedEntityParam, setActiveEntityId]);

  useEffect(() => {
    const normalizedCurrent = normalizeEntityId(searchParams.get('entityId'));
    if (normalizedCurrent === activeEntityId) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    if (activeEntityId) {
      next.set('entityId', activeEntityId);
    } else {
      next.delete('entityId');
    }
    setSearchParams(next, { replace: true });
  }, [activeEntityId, searchParams, setSearchParams]);

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
    updateStage(step);
  };

  const handleEntityChange = useCallback(
    (entityId: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (entityId) {
        next.set('entityId', entityId);
      } else {
        next.delete('entityId');
      }
      setSearchParams(next, { replace: true });
      setActiveEntityId(entityId);
    },
    [searchParams, setActiveEntityId, setSearchParams],
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
      {activeStep === 'mapping' && <MappingMonthHelper />}
      <StepTabs activeStep={activeStep} onStepChange={handleStepChange} />
      <section
        aria-label="Mapping workspace content"
        className="w-full rounded-t-none rounded-b-lg border border-gray-200 border-t-0 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        {activeStep === 'mapping' && <MappingTable />}
        {activeStep === 'reconcile' && <ReconcilePane />}
        {activeStep === 'distribution' && <DistributionTable />}
        {activeStep === 'review' && <ReviewPane />}
      </section>
    </div>
  );
}