type TelemetryClient = {
  trackEvent?: (event: { name: string; properties?: Record<string, unknown> }) => void;
  trackMetric?: (metric: { name: string; value: number; properties?: Record<string, unknown> }) => void;
};

type GlobalTelemetryBridge = {
  mapLedgerTelemetry?: TelemetryClient;
};

const telemetryClient = (globalThis as unknown as GlobalTelemetryBridge).mapLedgerTelemetry;

const logMetric = (name: string, payload: Record<string, unknown>) => {
  if (telemetryClient?.trackEvent) {
    telemetryClient.trackEvent({ name, properties: payload });
    return;
  }

  if (telemetryClient?.trackMetric) {
    telemetryClient.trackMetric({ name, value: 1, properties: payload });
    return;
  }

  if (typeof console !== 'undefined') {
    console.info('[MapLedger Telemetry]', name, payload);
  }
};

export interface MappingSaveTriggeredMetric {
  dirtyRows: number;
  elapsedMs?: number;
  savedRows?: number;
  eventSource?: string;
  timestamp?: number;
}

export interface MappingSaveAttemptMetric {
  dirtyRows: number;
  payloadRows: number;
  elapsedMs: number;
  savedRows: number;
  success: boolean;
  errorMessage?: string | null;
  source?: string;
}

export const trackMappingSaveTriggered = (payload: MappingSaveTriggeredMetric): void => {
  logMetric('mapping.save.triggered', {
    ...payload,
    timestamp: payload.timestamp ?? Date.now(),
  });
};

export const trackMappingSaveAttempt = (payload: MappingSaveAttemptMetric): void => {
  logMetric('mapping.save.attempt', {
    ...payload,
    timestamp: Date.now(),
  });
};
