import { getChartOfAccountOptions } from '../store/chartOfAccountsStore';
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

  const merged = [...templateOptions, ...getChartOfAccountOptions()];
  const uniqueById = new Map<string, TargetScoaOption>();

  merged.forEach(option => {
    if (!uniqueById.has(option.id)) {
      uniqueById.set(option.id, option);
    }
  });

  return Array.from(uniqueById.values()).sort((a, b) =>
    a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' }),
  );
};

export { convertDatapointToOption as toTargetScoaOption };
