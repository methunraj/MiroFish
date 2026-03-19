import api from "./client";

export const socialApi = {
  getPosts: (simId: string, limit = 50) =>
    api.get(`/sim/${simId}/social/posts`, { params: { limit } }),

  getThreads: (simId: string) =>
    api.get(`/sim/${simId}/social/threads`),

  getDebates: (simId: string) =>
    api.get(`/sim/${simId}/social/debates`),

  getOpinion: (simId: string) =>
    api.get(`/sim/${simId}/social/opinion`),

  getTrending: (simId: string) =>
    api.get(`/sim/${simId}/social/trending`),

  getAgentSpotlight: (simId: string, agentId: string) =>
    api.get(`/sim/${simId}/agents/${agentId}/spotlight`),

  getAgentStates: (simId: string) =>
    api.get(`/sim/${simId}/agents/states`),

  injectEvent: (simId: string, eventText: string) =>
    api.post(`/sim/${simId}/inject-event`, { event: eventText }),

  stream: (simId: string) =>
    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001"}/api/sim/${simId}/stream`,
};
