import { create } from 'zustand';

interface MappingSelectionState {
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
}

export const useMappingSelectionStore = create<MappingSelectionState>(set => ({
  selectedIds: new Set(),
  toggleSelection: id =>
    set(state => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedIds: next };
    }),
  setSelection: ids => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),
}));
