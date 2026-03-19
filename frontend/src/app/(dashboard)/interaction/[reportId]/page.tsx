"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelButton } from "@/components/ui/pixel-button";
import { PixelBadge } from "@/components/ui/pixel-badge";
import { PixelInput } from "@/components/ui/pixel-input";
import { TopBar } from "@/components/layout/top-bar";
import { LoadingState } from "@/components/shared/loading-state";
import api from "@/lib/api/client";

interface AgentInfo {
  id: string;
  name: string;
  role: string;
  portrait_url?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  agent_id?: string;
  agent_name?: string;
  content: string;
}

export default function InteractionPage() {
  const params = useParams();
  const reportId = params.reportId as string;

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [surveyMode, setSurveyMode] = useState(false);
  const [loading, setLoading] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await api.get(`/sim/${reportId}/population`);
      const population = res.data?.population ?? [];
      setAgents(
        population.map((p: Record<string, string>) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          portrait_url: p.portrait_url,
        }))
      );
      if (population.length > 0 && !selectedAgent) {
        setSelectedAgent(population[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch agents:", err);
    } finally {
      setLoading(false);
    }
  }, [reportId, selectedAgent]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput("");
    setSending(true);

    const userMsg: ChatMessage = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);

    try {
      if (surveyMode) {
        const res = await api.post(`/sim/${reportId}/chat`, {
          message: msg,
          history: messages,
          mode: "survey",
        });
        const replies: ChatMessage[] =
          res.data?.replies?.map(
            (r: { agent_name: string; agent_id: string; content: string }) => ({
              role: "assistant" as const,
              agent_id: r.agent_id,
              agent_name: r.agent_name,
              content: r.content,
            })
          ) ?? [];

        setMessages((prev) => [...prev, ...replies]);
      } else {
        const agent = agents.find((a) => a.id === selectedAgent);
        const res = await api.post(`/sim/${reportId}/chat`, {
          message: msg,
          history: messages,
          agent_id: selectedAgent,
        });

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            agent_id: selectedAgent ?? undefined,
            agent_name: agent?.name ?? "Agent",
            content: res.data?.reply ?? "No response",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Error: could not get response",
        },
      ]);
    }

    setSending(false);
  };

  if (loading) return <LoadingState message="LOADING AGENTS..." />;

  const currentAgent = agents.find((a) => a.id === selectedAgent);

  return (
    <>
      <TopBar
        breadcrumbs={[
          { label: "INTERACTION" },
          { label: reportId.slice(0, 8) },
        ]}
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Mode Toggle */}
        <div className="flex items-center justify-between">
          <h1 className="font-[family-name:var(--font-pixel)] text-sm uppercase tracking-wider">
            Agent Interview
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-[8px] font-[family-name:var(--font-pixel)] text-muted-foreground uppercase">
              Survey Mode
            </span>
            <button
              onClick={() => setSurveyMode(!surveyMode)}
              className={`relative w-10 h-5 border-2 transition-colors ${
                surveyMode
                  ? "border-primary bg-primary/20"
                  : "border-border bg-muted"
              }`}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 border-2 transition-all ${
                  surveyMode
                    ? "right-0.5 border-primary bg-primary"
                    : "left-0.5 border-border bg-muted-foreground"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Agent Selector Grid */}
          <aside className="space-y-3">
            <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
              {surveyMode ? "All Agents Respond" : "Select Agent"}
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 max-h-[500px] overflow-y-auto">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => !surveyMode && setSelectedAgent(agent.id)}
                  disabled={surveyMode}
                  className="text-left"
                >
                  <PixelCard
                    glow={!surveyMode && selectedAgent === agent.id}
                    className={`p-2 transition-all ${
                      surveyMode
                        ? "opacity-60"
                        : "cursor-pointer hover:translate-y-[-1px]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {agent.portrait_url ? (
                        <img
                          src={agent.portrait_url}
                          alt={agent.name}
                          className="size-8 border-2 border-border object-cover"
                        />
                      ) : (
                        <div className="size-8 border-2 border-border bg-muted flex items-center justify-center">
                          <span className="text-[8px] font-[family-name:var(--font-pixel)] text-muted-foreground">
                            {agent.name.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-wider truncate">
                          {agent.name}
                        </p>
                        <p className="text-[7px] text-muted-foreground truncate">
                          {agent.role}
                        </p>
                      </div>
                    </div>
                  </PixelCard>
                </button>
              ))}
            </div>
          </aside>

          {/* Chat Interface */}
          <div className="flex flex-col">
            {/* Chat Header */}
            <PixelCard className="mb-0 border-b-0">
              <div className="flex items-center gap-2">
                {surveyMode ? (
                  <PixelBadge variant="coral">SURVEY MODE</PixelBadge>
                ) : currentAgent ? (
                  <>
                    <PixelBadge variant="blue">{currentAgent.name}</PixelBadge>
                    <span className="text-xs text-muted-foreground">
                      {currentAgent.role}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Select an agent to begin
                  </span>
                )}
              </div>
            </PixelCard>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="border-2 border-t-0 border-border bg-card flex-1 min-h-[400px] max-h-[500px] overflow-y-auto p-4 space-y-3"
            >
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <span className="text-[10px] font-[family-name:var(--font-pixel)] text-muted-foreground uppercase">
                    Start a conversation...
                  </span>
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`max-w-[80%] ${
                    msg.role === "user" ? "ml-auto" : "mr-auto"
                  }`}
                >
                  {msg.role === "assistant" && msg.agent_name && (
                    <span className="text-[8px] font-[family-name:var(--font-pixel)] text-primary uppercase mb-1 block">
                      {msg.agent_name}
                    </span>
                  )}
                  <div
                    className={`p-3 border-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "border-primary/40 bg-primary/10"
                        : "border-border bg-muted"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="mr-auto max-w-[80%]">
                  <div className="p-3 border-2 border-border bg-muted text-sm text-muted-foreground font-[family-name:var(--font-pixel-body)]">
                    THINKING...
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-2 border-t-0 border-border bg-card p-3 flex gap-2">
              <PixelInput
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder={
                  surveyMode
                    ? "Ask all agents..."
                    : `Ask ${currentAgent?.name ?? "agent"}...`
                }
                className="flex-1"
                disabled={!surveyMode && !selectedAgent}
              />
              <PixelButton
                onClick={sendMessage}
                disabled={sending || (!surveyMode && !selectedAgent)}
              >
                {sending ? "..." : ">> SEND"}
              </PixelButton>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
