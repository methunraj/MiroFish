import api from "./client";

export const reportApi = {
  generate: (data: Record<string, unknown>) =>
    api.post("/report/generate", data),
  generateStatus: (data: Record<string, unknown>) =>
    api.post("/report/generate/status", data),
  get: (id: string) => api.get(`/report/${id}`),
  getBySimulation: (simId: string) => api.get(`/report/by-simulation/${simId}`),
  list: () => api.get("/report/list"),
  download: (id: string) => api.get(`/report/${id}/download`),
  delete: (id: string) => api.delete(`/report/${id}`),
  chat: (data: {
    message: string;
    simulation_id: string;
    graph_id: string;
    history?: unknown[];
  }) => api.post("/report/chat", data),
  getProgress: (id: string) => api.get(`/report/${id}/progress`),
  getSections: (id: string) => api.get(`/report/${id}/sections`),
  getAgentLog: (id: string, fromLine = 0) =>
    api.get(`/report/${id}/agent-log`, { params: { from_line: fromLine } }),
  getConsoleLog: (id: string, fromLine = 0) =>
    api.get(`/report/${id}/console-log`, { params: { from_line: fromLine } }),
};
