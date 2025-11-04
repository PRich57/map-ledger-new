import { DatapointConfigurationInput } from '../../repositories/datapointConfigurationRepository';

export const toStringArray = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry : String(entry)))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [String(value)];
};

export const sanitizePayload = (
  body: Record<string, unknown>
): DatapointConfigurationInput => ({
  label: typeof body.label === 'string' ? body.label : null,
  userEmail: typeof body.userEmail === 'string' ? body.userEmail.trim() : '',
  userName: typeof body.userName === 'string' ? body.userName.trim() : null,
  clientId: typeof body.clientId === 'string' ? body.clientId.trim() : '',
  clientName: typeof body.clientName === 'string' ? body.clientName.trim() : '',
  companyName:
    typeof body.companyName === 'string' ? body.companyName.trim() : null,
  sourceAccountId:
    typeof body.sourceAccountId === 'string'
      ? body.sourceAccountId.trim()
      : null,
  sourceAccountName:
    typeof body.sourceAccountName === 'string'
      ? body.sourceAccountName.trim()
      : null,
  sourceAccountDescription:
    typeof body.sourceAccountDescription === 'string'
      ? body.sourceAccountDescription.trim()
      : null,
  reportingPeriod:
    typeof body.reportingPeriod === 'string'
      ? body.reportingPeriod.trim()
      : null,
  mappingType:
    typeof body.mappingType === 'string' ? body.mappingType.trim() : null,
  targetSCoA:
    typeof body.targetSCoA === 'string' ? body.targetSCoA.trim() : null,
  polarity: typeof body.polarity === 'string' ? body.polarity.trim() : null,
  preset: typeof body.preset === 'string' ? body.preset.trim() : null,
  operations: toStringArray(body.operations),
  exclusions: toStringArray(body.exclusions),
  configuration:
    body.configuration && typeof body.configuration === 'object'
      ? (body.configuration as Record<string, unknown>)
      : null,
});
