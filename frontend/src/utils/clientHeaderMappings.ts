const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export interface ClientHeaderMapping {
  mappingId: number;
  templateHeader: string;
  sourceHeader: string;
  mappingMethod: string;
  insertedAt?: string;
  updatedAt?: string;
  updatedBy?: string | null;
}

interface ClientHeaderMappingResponse {
  items?: ClientHeaderMapping[];
}

export interface ClientHeaderMappingSaveInput {
  templateHeader: string;
  sourceHeader: string | null;
  mappingMethod: string;
  updatedBy?: string | null;
}

export const fetchClientHeaderMappings = async (
  clientId: string
): Promise<ClientHeaderMapping[]> => {
  const normalizedClientId = clientId.trim();
  if (!normalizedClientId) {
    return [];
  }

  const response = await fetch(
    `${API_BASE_URL}/client-header-mappings?clientId=${encodeURIComponent(normalizedClientId)}`
  );

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Failed to load header mappings (${response.status})`);
  }

  const payload = (await response.json()) as ClientHeaderMappingResponse;
  return payload.items ?? [];
};

export const saveClientHeaderMappings = async (
  clientId: string,
  mappings: ClientHeaderMappingSaveInput[]
): Promise<ClientHeaderMapping[]> => {
  const normalizedClientId = clientId.trim();
  if (!normalizedClientId) {
    return [];
  }

  const payload = {
    clientId: normalizedClientId,
    mappings,
  };

  const requestInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  };

  const url = `${API_BASE_URL}/client-header-mappings`;
  const response = await fetch(url, requestInit);

  if (!response.ok) {
    throw new Error(`Failed to save header mappings (${response.status})`);
  }

  const body = (await response.json()) as ClientHeaderMappingResponse;
  return body.items ?? [];
};
