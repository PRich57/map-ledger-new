export interface IncomingSplitDefinition {
  targetId?: string | null;
  basisDatapoint?: string | null;
  allocationType?: string | null;
  allocationValue?: number | null;
  isCalculated?: boolean | null;
  isExclusion?: boolean | null;
  recordId?: number | null;
}

export interface NormalizedSplitDefinition {
  basisDatapoint: string | null;
  targetDatapoint: string;
  isCalculated: boolean | null;
  specifiedPct: number | null;
  appliedPct: number | null;
  recordId?: number | null;
}
