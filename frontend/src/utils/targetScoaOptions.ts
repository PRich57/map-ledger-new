import { STANDARD_CHART_OF_ACCOUNTS } from '../data/standardChartOfAccounts';
import { Datapoint, TargetScoaOption } from '../types';

const convertDatapointToOption = (datapoint: Datapoint): TargetScoaOption => ({
  id: datapoint.id,
  value: datapoint.coreGLAccount,
  label: datapoint.accountName,
});

export const buildTargetScoaOptions = (
  datapoints: Record<string, Datapoint[]>,
): TargetScoaOption[] => {
  const templateOptions = Object.values(datapoints)
    .flat()
    .map(convertDatapointToOption);

  const merged = [...templateOptions, ...STANDARD_CHART_OF_ACCOUNTS];
  const uniqueById = new Map<string, TargetScoaOption>();

  merged.forEach(option => {
    if (!uniqueById.has(option.id)) {
      uniqueById.set(option.id, option);
    }
  });

  return Array.from(uniqueById.values()).sort((a, b) => a.label.localeCompare(b.label));
};

export { convertDatapointToOption as toTargetScoaOption };
