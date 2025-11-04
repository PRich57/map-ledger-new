export interface ClientTemplateConfig {
    OPERATIONAL_SCAC: string;
    FILE_TYPE: string;
    ENTITY_TYPE: 'fixed' | 'column';
    ENTITY_CELL?: string;
    ENTITY_HEADER_RANGE?: string;
    GL_MONTH_CELL?: string;
    GL_ID_HEADER_RANGE?: string;
    ACCOUNT_DESCRIPTION_HEADER_RANGE?: string;
    NET_CHANGE_HEADER_RANGE?: string;
    USER_DEFINED_1_HEADER_RANGE?: string;
    USER_DEFINED_2_HEADER_RANGE?: string;
    USER_DEFINED_3_HEADER_RANGE?: string;
    DATA_START_ROW?: number;
  }
  
  export async function getClientTemplateMapping(scac: string): Promise<ClientTemplateConfig | null> {
    try {
      const res = await fetch(`/api/config/${scac}`);
      if (!res.ok) throw new Error(`Failed to fetch config: ${res.status}`);
      const config = await res.json();
      return config;
    } catch (err) {
      console.error('Error fetching client config:', err);
      return null;
    }
  }