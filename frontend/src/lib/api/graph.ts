import api from "./client";

export const graphApi = {
  generateOntology: (formData: FormData) =>
    api.post("/graph/ontology/generate", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  build: (data: { project_id: string; graph_id: string }) =>
    api.post("/graph/build", data),
  getTask: (taskId: string) => api.get(`/graph/task/${taskId}`),
  getGraphData: (graphId: string) => api.get(`/graph/data/${graphId}`),
  getProject: (projectId: string) => api.get(`/graph/project/${projectId}`),
  listProjects: () => api.get("/graph/project/list"),
  deleteProject: (projectId: string) =>
    api.delete(`/graph/project/${projectId}`),
  resetProject: (projectId: string) =>
    api.post(`/graph/project/${projectId}/reset`),
};
