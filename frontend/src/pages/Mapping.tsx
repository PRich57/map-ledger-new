import { useCallback, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import MappingHeader from '../components/mapping/MappingHeader';
import StepTabs, { MappingStep } from '../components/mapping/StepTabs';
import SummaryCards from '../components/mapping/SummaryCards';
import MappingTable from '../components/mapping/MappingTable';
import DistributionTable from '../components/mapping/DistributionTable';
import ReviewPane from '../components/mapping/ReviewPane';
import MappingMonthHelper from '../components/mapping/MappingMonthHelper';
import { useMappingStore } from '../store/mappingStore';
import scrollPageToTop from '../utils/scroll';

const stepParam = (value: string | null): MappingStep => {
  if (value === 'distribution' || value === 'review') {
    return value;
  }
  return 'mapping';
};

export default function Mapping() {
  const { uploadId = 'demo' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeClientId = useMappingStore(state => state.activeClientId);
  const activeStep = useMemo(() => stepParam(searchParams.get('stage')), [searchParams]);

  useEffect(() => {
    if (activeStep === 'mapping') {
      scrollPageToTop({ behavior: 'auto' });
    }
  }, [activeStep]);

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

  return (
    <div data-testid="mapping-page" className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <MappingHeader clientId={activeClientId ?? undefined} glUploadId={uploadId} />
      <SummaryCards />
      {activeStep === 'mapping' && <MappingMonthHelper />}
      <StepTabs activeStep={activeStep} onStepChange={handleStepChange} />
      <section
        aria-label="Mapping workspace content"
        className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        {activeStep === 'mapping' && <MappingTable />}
        {activeStep === 'distribution' && <DistributionTable />}
        {activeStep === 'review' && <ReviewPane />}
      </section>
    </div>
  );
}