import type { IdTokenClaims as TokenClaims } from '@azure/msal-browser';

export interface GroupTokenClaims extends TokenClaims {
  groups?: string[];
  [key: string]: unknown;
}

export type UserRole = 'super' | 'admin' | 'viewer';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
}

export interface ClientProfile {
  id: string;
  clientId: string;
  name: string;
  scac?: string | null;
  industry?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactEmail?: string;
  accountingSystem?: string;
  operations?: UserClientOperation[];
}

export interface UserClientOperation {
  id: string;
  code: string;
  name: string;
  operationalScac?: string | null;
  isActive?: boolean;
}

export interface UserClientCompany {
  companyId: string;
  companyName: string;
  companyScac?: string | null;
  operationalScac?: string | null;
  operations: UserClientOperation[];
}

export interface UserClientMetadata {
  sourceAccounts: {
    id: string;
    name: string;
    description: string | null;
  }[];
  reportingPeriods: string[];
  mappingTypes: string[];
  targetSCoAs: string[];
  polarities: string[];
  presets: string[];
  exclusions: string[];
}

export interface UserClientAccess {
  clientId: string;
  clientName: string;
  clientScac: string | null;
  operations?: UserClientOperation[];
  companies: UserClientCompany[];
  metadata: UserClientMetadata;
}

export interface DatapointConfiguration {
  id: string;
  label: string | null;
  userEmail: string;
  userName: string | null;
  clientId: string;
  clientName: string;
  companyName: string | null;
  sourceAccountId: string | null;
  sourceAccountName: string | null;
  sourceAccountDescription: string | null;
  reportingPeriod: string | null;
  mappingType: string | null;
  targetSCoA: string | null;
  polarity: string | null;
  preset: string | null;
  operations: string[];
  exclusions: string[];
  configuration: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface COATemplate {
  id: string;
  name: string;
  industry: string;
  interval: 'Monthly' | 'Quarterly';
  functionalGroups: {
    id: string;
    name: string;
    code: string;
  }[];
  operationalGroups: {
    id: string;
    name: string;
    code: string;
  }[];
}

export interface Datapoint {
  id: string;
  templateId: string;
  accountName: string;
  accountDescription: string;
  type: 'Financial' | 'Operational' | 'Calculated';
  accountType: 'Assets' | 'Liabilities' | 'Equity' | 'Revenue' | 'Expenses';
  balanceType: 'Debit' | 'Credit';
  coreGLAccount: string;
  /**
   * 1 denotes a leaf account in the COA, 2 denotes a roll-up group
   */
  detailLevel?: number;
  functionalGroupId: string;
  operationalGroupId: string;
  formula?: string;
  sortOrder: number;
}

export interface TargetScoaOption {
  id: string;
  value: string;
  label: string;
}

export interface ChartOfAccount {
  accountNumber: string;
  coreAccount: string | null;
  operationalGroup: string | null;
  laborGroup: string | null;
  accountType: string | null;
  category: string | null;
  subCategory: string | null;
  description: string | null;
}

export interface ChartOfAccountOption extends TargetScoaOption, ChartOfAccount {}

export interface StandardScoaSummary {
  id: string;
  value: string;
  label: string;
  mappedAmount: number;
}

export interface ReconciliationSourceMapping {
  glAccountId: string;
  glAccountName: string;
  entityName?: string;
  companyName: string;
  amount: number;
}

export interface ReconciliationAccountBreakdown {
  id: string;
  label: string;
  subcategory: string;
  total: number;
  sources: ReconciliationSourceMapping[];
}

export interface ReconciliationSubcategoryGroup {
  subcategory: string;
  total: number;
  accounts: ReconciliationAccountBreakdown[];
}

export interface ImportPreviewRow {
  entity: string;
  accountId: string;
  description: string;
  netChange: number;
  glMonth?: string;
}

export interface TrialBalanceRow {
  entity: string;
  entityId?: string | null;
  entityName?: string | null;
  accountId: string;
  description: string;
  netChange: number;
  glMonth?: string;
  [key: string]: unknown;
}

export interface ImportSheet {
  sheetName: string;
  glMonth?: string;
  rowCount: number;
  isSelected?: boolean;
  firstDataRowIndex?: number;
}

export interface ImportEntity {
  entityId?: string;
  entityName: string;
  displayName?: string;
  rowCount: number;
  isSelected?: boolean;
  insertedDttm?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface Import {
  id: string;
  fileUploadGuid?: string;
  clientId: string;
  clientName?: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileStorageUri?: string;
  fileUri?: string;
  blobUrl?: string;
  blobUri?: string;
  period: string;
  timestamp: string;
  status: 'completed' | 'failed';
  rowCount?: number;
  importedBy: string;
  insertedDttm?: string;
  userId: string;
  uploadContext?: Record<string, unknown>;
  sheets?: ImportSheet[];
  entities?: ImportEntity[];
}

export interface FileRecord {
  fileUploadGuid: string;
  fileUploadId?: string;
  recordId: string;
  entityId?: string | null;
  accountId: string;
  accountName: string;
  activityAmount: number;
  entityName?: string;
  glMonth?: string;
  sourceSheet?: string;
  sourceRowNumber?: number;
}

export interface SyncedAccount {
  id: string;
  accountNumber: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balance: number;
  lastSync: string;
  mapped: boolean;
}

export interface SyncHistory {
  id: string;
  timestamp: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  details?: string;
  affectedAccounts: number;
}

export interface ConnectionStatus {
  connected: boolean;
  lastSync?: string;
  company?: string;
  environment?: string;
  error?: string;
}

export interface RatioAllocationTargetDatapoint {
  datapointId: string;
  name: string;
  groupId?: string;
  ratioMetric: {
    id: string;
    name: string;
    value: number;
  };
  isExclusion?: boolean;
}

export interface RatioAllocation {
  id: string;
  name: string;
  sourceAccount: {
    id: string;
    number: string;
    description: string;
  };
  targetDatapoints: RatioAllocationTargetDatapoint[];
  effectiveDate: string;
  status: 'active' | 'inactive';
}

export interface AllocationResultTargetBreakdown {
  datapointId: string;
  targetId: string;
  targetName: string;
  basisValue: number;
  value: number;
  percentage: number;
  ratio: number;
  isExclusion?: boolean;
}

export interface AllocationResultAdjustment {
  targetId: string;
  amount: number;
}

export interface AllocationResult {
  allocationId: string;
  allocationName: string;
  periodId: string;
  sourceAccountId: string;
  sourceAccountName: string;
  sourceValue: number;
  basisTotal: number;
  runAt: string;
  adjustment?: AllocationResultAdjustment;
  allocations: AllocationResultTargetBreakdown[];
}

export interface OperationalMetric {
  id: string;
  name: string;
  description: string;
  type: string;
  value: number;
  period: string;
}

export interface DynamicSourceAccount {
  id: string;
  name: string;
  number: string;
  description: string;
  /**
   * Default value used when period-specific balances are unavailable.
   */
  value: number;
  /**
   * Optional map of period identifier to balance so dynamic allocations can
   * run across multiple reporting cycles without hard-coding dates.
   */
  valuesByPeriod?: Record<string, number>;
}

export interface DynamicBasisAccount {
  id: string;
  name: string;
  description: string;
  /**
   * Default value used when a period-specific balance is not supplied.
   */
  value: number;
  mappedTargetId: string;
  /**
   * Optional map of period identifier to balance for dynamic ratios.
   */
  valuesByPeriod?: Record<string, number>;
}

export interface DynamicAllocationPresetRow {
  dynamicAccountId: string;
  targetAccountId: string;
}

export interface DynamicAllocationPreset {
  id: string;
  name: string;
  rows: DynamicAllocationPresetRow[];
  notes?: string;
}

export interface DynamicAllocationBasisMember {
  accountId: string;
  accountName: string;
  value: number;
}

export interface DynamicAllocationGroupMember {
  accountId: string;
  accountName: string;
  basisValue: number;
  targetAccountId: string;
  targetName: string;
}

export interface DynamicAllocationGroup extends DynamicAllocationPreset {
  members: DynamicAllocationGroupMember[];
}

export interface DynamicAllocationTargetAudit {
  targetId: string;
  targetName: string;
  basisValue: number;
  ratio: number;
  percentage: number;
  allocation: number;
  basisMembers: DynamicAllocationBasisMember[];
  presetId?: string;
}

export interface DynamicAllocationAuditRecord {
  id: string;
  allocationId: string;
  allocationName: string;
  periodId: string;
  runAt: string;
  sourceAccount: {
    id: string;
    number: string;
    description: string;
  };
  sourceAmount: number;
  basisTotal: number;
  targets: DynamicAllocationTargetAudit[];
  adjustment?: AllocationResultAdjustment;
  presetId?: string | null;
  userId?: string | null;
}

export interface DynamicAllocationValidationIssue {
  id: string;
  allocationId: string;
  periodId: string;
  sourceAccountId: string;
  sourceAccountName: string;
  message: string;
  targetIds?: string[];
}
export interface OperationRef {
  id: string; // SCAC code
  name: string;
}

export interface ClientRef {
  id: string;
  name: string;
  operations: OperationRef[];
}

export interface EntityRef {
  id: string;
  name: string;
  clients: ClientRef[];
}

export interface EntitySummary {
  id: string;
  name: string;
}

export interface ClientEntity {
  id: string;
  name: string;
  displayName?: string;
  entityName?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  aliases: string[];
}

export interface GLAccountEntityBreakdown {
  id: string;
  entity: string;
  balance: number;
}

export type MappingStatus = 'Mapped' | 'Unmapped' | 'New' | 'Excluded';

export type MappingType = 'direct' | 'percentage' | 'dynamic' | 'exclude';

export type MappingPolarity = 'Debit' | 'Credit' | 'Absolute';

export interface MappingSplitDefinition {
  id: string;
  targetId: string;
  targetName: string;
  allocationType: 'percentage' | 'amount';
  allocationValue: number;
  notes?: string;
  isExclusion?: boolean;
}

export type DistributionType = 'direct' | 'percentage' | 'dynamic';

export interface DistributionOperationShare {
  id: string;
  name: string;
  code?: string;
  allocation?: number;
  notes?: string;
}

export type DistributionStatus = 'Distributed' | 'Undistributed';

export interface DistributionRow {
  id: string;
  mappingRowId: string;
  accountId: string;
  description: string;
  activity: number;
  type: DistributionType;
  operations: DistributionOperationShare[];
  presetId?: string | null;
  notes?: string;
  status: DistributionStatus;
}

export interface GLAccountMappingRow {
  id: string;
  entityId: string | null;
  entityName: string | null;
  accountId: string;
  accountName: string;
  activity: number;
  status: MappingStatus;
  mappingType: MappingType;
  netChange: number;
  operation: string;
  suggestedCOAId?: string;
  suggestedCOADescription?: string;
  aiConfidence?: number;
  manualCOAId?: string;
  polarity: MappingPolarity;
  presetId?: string;
  exclusionPct?: number | null;
  notes?: string;
  splitDefinitions: MappingSplitDefinition[];
  entities: GLAccountEntityBreakdown[];
  dynamicExclusionAmount?: number;
  glMonth?: string; // GL month in YYYY-MM format
  requiresEntityAssignment?: boolean;
}

export interface GLUpload {
  id: number;
  fileName: string;
}

export interface GLAccountRaw {
  id: number;
  glUpload: GLUpload;
  accountCode: string;
  description: string;
  debit?: number;
  credit?: number;
  balance: number;
}

export interface MappingSuggestion {
  id: number;
  description: string;
}

export interface FinalMapping {
  id: string;
  glAccountRawId: string;
  mappedCOAAccountId: string;
  mappedBy: string;
  mappedDate: string;
}