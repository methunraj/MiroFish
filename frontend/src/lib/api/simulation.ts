import api from "./client";

export interface SimCreatePayload {
  mode: string;
  config: Record<string, unknown>;
}

export const simulationApi = {
  /* unified sim endpoints */
  create: (data: SimCreatePayload) => api.post("/sim/create", data),
  getStatus: (id: string) => api.get(`/sim/${id}/status`),
  getActions: (id: string, from = 0) =>
    api.get(`/sim/${id}/actions`, { params: { from } }),
  getVizData: (id: string, type: string) =>
    api.get(`/sim/${id}/viz-data`, { params: { type } }),
  stop: (id: string) => api.post(`/sim/${id}/stop`),
  forceComplete: (id: string) => api.post(`/sim/${id}/force-complete`),
  generateReport: (id: string) => api.post(`/sim/${id}/report`),
  getPopulation: (id: string) => api.get(`/sim/${id}/population`),
  getReport: (id: string) => api.get(`/sim/${id}/report`),
  chat: (id: string, message: string, history: unknown[] = []) =>
    api.post(`/sim/${id}/chat`, { message, history }),
  getInterviews: (id: string) => api.get(`/sim/${id}/interviews`),
  autoConfig: (topic: string, mode: string) =>
    api.post("/sim/auto-config", { topic, mode }),
  list: (limit = 50) => api.get("/sim/list", { params: { limit } }),

  /* legacy document-sim endpoints */
  legacyCreate: (data: Record<string, unknown>) =>
    api.post("/simulation/create", data),
  legacyPrepare: (data: Record<string, unknown>) =>
    api.post("/simulation/prepare", data),
  legacyPrepareStatus: (data: Record<string, unknown>) =>
    api.post("/simulation/prepare/status", data),
  legacyGet: (id: string) => api.get(`/simulation/${id}`),
  legacyProfiles: (id: string) => api.get(`/simulation/${id}/profiles`),
  legacyProfilesRealtime: (id: string) =>
    api.get(`/simulation/${id}/profiles/realtime`),
  legacyConfig: (id: string) => api.get(`/simulation/${id}/config`),
  legacyConfigRealtime: (id: string) =>
    api.get(`/simulation/${id}/config/realtime`),
  legacyStart: (data: Record<string, unknown>) =>
    api.post("/simulation/start", data),
  legacyStop: (data: Record<string, unknown>) =>
    api.post("/simulation/stop", data),
  legacyRunStatus: (id: string) => api.get(`/simulation/${id}/run-status`),
  legacyRunStatusDetail: (id: string) =>
    api.get(`/simulation/${id}/run-status/detail`),
  legacyAgentStats: (id: string) => api.get(`/simulation/${id}/agent-stats`),
  legacyPosts: (id: string) => api.get(`/simulation/${id}/posts`),
  legacyTimeline: (id: string) => api.get(`/simulation/${id}/timeline`),
  legacyHistory: () => api.get("/simulation/history"),
  legacyList: () => api.get("/simulation/list"),
};
