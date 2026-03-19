import { create } from "zustand";

export type SimMode =
  | "document"
  | "prompt"
  | "policy"
  | "product_launch"
  | "crisis"
  | "election"
  | "economy"
  | "custom";

export interface HistoryItem {
  id: string;
  mode: SimMode;
  name: string;
  status: string;
  created_at: string;
}

interface AppState {
  sidebarExpanded: boolean;
  setSidebarExpanded: (v: boolean) => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (v: boolean) => void;

  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;

  currentPhase: string;
  currentPhaseProgress: number;
  setPhase: (name: string, progress: number) => void;

  history: HistoryItem[];
  setHistory: (items: HistoryItem[]) => void;
  addHistoryItem: (item: HistoryItem) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarExpanded: false,
  setSidebarExpanded: (v) => set({ sidebarExpanded: v }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),

  chatOpen: false,
  setChatOpen: (v) => set({ chatOpen: v }),

  currentPhase: "",
  currentPhaseProgress: 0,
  setPhase: (name, progress) =>
    set({ currentPhase: name, currentPhaseProgress: progress }),

  history: [],
  setHistory: (items) => set({ history: items }),
  addHistoryItem: (item) =>
    set((s) => ({ history: [item, ...s.history] })),
}));
