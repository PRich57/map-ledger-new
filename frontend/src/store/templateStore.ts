import { create } from 'zustand';
import { COATemplate, Datapoint } from '../types';
import { parseCOATemplateFile } from '../utils/parseCOATemplateFile';
import { buildTemplateFromRows } from '../utils/buildTemplateFromRows';

interface TemplateState {
  templates: COATemplate[];
  datapoints: Record<string, Datapoint[]>;
  addTemplate: (template: Omit<COATemplate, 'id'>) => void;
  updateTemplate: (id: string, template: Omit<COATemplate, 'id'>) => void;
  deleteTemplate: (id: string) => void;
  addDatapoint: (templateId: string, datapoint: Omit<Datapoint, 'id' | 'templateId' | 'sortOrder'>) => void;
  updateDatapoint: (templateId: string, datapointId: string, datapoint: Omit<Datapoint, 'id' | 'templateId' | 'sortOrder'>) => void;
  deleteDatapoint: (templateId: string, datapointId: string) => void;
  reorderDatapoints: (templateId: string, datapointIds: string[]) => void;
  importTemplateFromFile: (
    file: File,
    info: { name: string; industry: string; interval: 'Monthly' | 'Quarterly' }
  ) => Promise<void>;
}

export const useTemplateStore = create<TemplateState>((set) => ({
  templates: [],
  datapoints: {},
  addTemplate: (template) =>
    set((state) => ({
      templates: [...state.templates, { ...template, id: crypto.randomUUID() }],
    })),
  updateTemplate: (id, template) =>
    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === id ? { ...template, id } : t
      ),
    })),
  deleteTemplate: (id) =>
    set((state) => ({
      templates: state.templates.filter((t) => t.id !== id),
      datapoints: Object.fromEntries(
        Object.entries(state.datapoints).filter(([key]) => key !== id)
      ),
    })),
  addDatapoint: (templateId, datapoint) =>
    set((state) => {
      const templateDatapoints = state.datapoints[templateId] || [];
      const newDatapoint: Datapoint = {
        ...datapoint,
        id: crypto.randomUUID(),
        templateId,
        sortOrder: templateDatapoints.length,
      };
      return {
        datapoints: {
          ...state.datapoints,
          [templateId]: [...templateDatapoints, newDatapoint],
        },
      };
    }),
  updateDatapoint: (templateId, datapointId, datapoint) =>
    set((state) => ({
      datapoints: {
        ...state.datapoints,
        [templateId]: (state.datapoints[templateId] || []).map((dp) =>
          dp.id === datapointId
            ? { ...datapoint, id: datapointId, templateId, sortOrder: dp.sortOrder }
            : dp
        ),
      },
    })),
  deleteDatapoint: (templateId, datapointId) =>
    set((state) => ({
      datapoints: {
        ...state.datapoints,
        [templateId]: (state.datapoints[templateId] || [])
          .filter((dp) => dp.id !== datapointId)
          .map((dp, index) => ({ ...dp, sortOrder: index })),
      },
    })),
  reorderDatapoints: (templateId, datapointIds) =>
    set((state) => ({
      datapoints: {
        ...state.datapoints,
        [templateId]: datapointIds
          .map((id, index) => {
            const dp = state.datapoints[templateId]?.find((d) => d.id === id);
            return dp ? { ...dp, sortOrder: index } : null;
          })
          .filter((dp): dp is Datapoint => dp !== null),
      },
    })),
  importTemplateFromFile: async (file, info) => {
    const rows = await parseCOATemplateFile(file);
    const id = crypto.randomUUID();
    const { template, datapoints } = buildTemplateFromRows(rows, info, id);
    set((state) => ({
      templates: [...state.templates, template],
      datapoints: { ...state.datapoints, [id]: datapoints },
    }));
  },
}));
