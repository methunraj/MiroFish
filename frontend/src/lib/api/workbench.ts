import api from "./client";

export interface CreateAgentPayload {
  name: string;
  role: string;
  goals: string[];
  tools: string[];
  knowledge_docs?: string[];
}

export interface DeployPayload {
  agent_id: string;
  task: string;
}

export interface CreateTeamPayload {
  name: string;
  agents: string[];
  shared_goal: string;
}

export const workbenchApi = {
  createAgent: (data: CreateAgentPayload) =>
    api.post("/workbench/create-agent", data),
  deploy: (data: DeployPayload) => api.post("/workbench/deploy", data),
  getStatus: (id: string) => api.get(`/workbench/${id}/status`),
  getActivities: (id: string, from = 0) =>
    api.get(`/workbench/${id}/activities`, { params: { from } }),
  getArtifacts: (id: string) => api.get(`/workbench/${id}/artifacts`),
  downloadArtifact: (id: string, filename: string) =>
    api.get(`/workbench/${id}/artifacts/${filename}`, {
      responseType: "blob",
    }),
  sendMessage: (id: string, message: string) =>
    api.post(`/workbench/${id}/message`, { message }),
  searchMemory: (id: string, query: string) =>
    api.get(`/workbench/${id}/memory`, { params: { query } }),
  stop: (id: string) => api.post(`/workbench/${id}/stop`),
  listAgents: () => api.get("/workbench/agents"),
  createTeam: (data: CreateTeamPayload) =>
    api.post("/workbench/team/create", data),
  getTeamStatus: (teamId: string) =>
    api.get(`/workbench/team/${teamId}/status`),
  getTeamActivities: (teamId: string, from = 0) =>
    api.get(`/workbench/team/${teamId}/activities`, { params: { from } }),
  getVizData: (id: string, type: string) =>
    api.get(`/workbench/${id}/viz-data`, { params: { type } }),
};
