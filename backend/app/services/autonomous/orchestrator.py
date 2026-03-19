"""
Agent orchestrator – singleton that manages all running agent processes.
"""

import threading
from typing import Dict, Any, List, Optional

from ...utils.llm_client import LLMClient
from ...models.workbench import WorkbenchStore, AgentModel
from .activity_logger import ActivityLogger
from .memory_store import MemoryStore
from .tool_router import ToolRouter
from .agent_process import AgentProcess


class AgentOrchestrator:
    """Singleton that owns all AgentProcess instances."""

    _instance: Optional["AgentOrchestrator"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "AgentOrchestrator":
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._processes: Dict[str, AgentProcess] = {}
                cls._instance._loggers: Dict[str, ActivityLogger] = {}
                cls._instance._memories: Dict[str, MemoryStore] = {}
            return cls._instance

    # ── Agent lifecycle ─────────────────────────────────────────

    def create_agent(
        self,
        name: str,
        role: str,
        goals: List[str],
        tools: List[str],
    ) -> AgentModel:
        agent = WorkbenchStore.create_agent(name, role, goals, tools)
        return agent

    def deploy(self, agent_id: str, task: str) -> Dict[str, Any]:
        agent = WorkbenchStore.get_agent(agent_id)
        if agent is None:
            return {"error": f"Agent {agent_id} not found"}

        if agent_id in self._processes and self._processes[agent_id].is_running():
            return {"error": f"Agent {agent_id} is already running"}

        try:
            llm = LLMClient()
        except Exception as e:
            return {"error": f"LLM client init failed: {e}"}

        logger = ActivityLogger(agent_id)
        memory = MemoryStore(agent_id)
        router = ToolRouter(agent_id)

        process = AgentProcess(
            agent_id=agent_id,
            agent_name=agent.name,
            role=agent.role,
            goals=agent.goals,
            task=task,
            tools=agent.tools,
            llm_client=llm,
            activity_logger=logger,
            memory_store=memory,
            tool_router=router,
        )

        self._processes[agent_id] = process
        self._loggers[agent_id] = logger
        self._memories[agent_id] = memory

        agent.status = "running"
        agent.task = task
        WorkbenchStore.update_agent(agent)

        process.start()
        return {"status": "deployed", "agent_id": agent_id, "task": task}

    def stop(self, agent_id: str) -> Dict[str, Any]:
        proc = self._processes.get(agent_id)
        if proc is None:
            return {"error": f"No process for agent {agent_id}"}
        proc.stop()
        agent = WorkbenchStore.get_agent(agent_id)
        if agent:
            agent.status = "stopped"
            WorkbenchStore.update_agent(agent)
        return {"status": "stopped", "agent_id": agent_id}

    def get_status(self, agent_id: str) -> Dict[str, Any]:
        proc = self._processes.get(agent_id)
        if proc is None:
            agent = WorkbenchStore.get_agent(agent_id)
            if agent is None:
                return {"error": f"Agent {agent_id} not found"}
            return {
                "agent_id": agent_id,
                "status": agent.status,
                "iteration": 0,
                "is_running": False,
                "final_answer": None,
                "error": None,
            }

        state = proc.get_state()
        agent = WorkbenchStore.get_agent(agent_id)
        if agent and agent.status != state["status"]:
            agent.status = state["status"]
            memory = self._memories.get(agent_id)
            if memory:
                agent.memory_size = memory.get_size()
            WorkbenchStore.update_agent(agent)

        return state

    def list_active(self) -> List[Dict[str, Any]]:
        active = []
        for aid, proc in self._processes.items():
            if proc.is_running():
                active.append(proc.get_state())
        return active

    # ── Team operations ─────────────────────────────────────────

    def create_team(
        self, name: str, agent_ids: List[str], shared_goal: str,
    ) -> Dict[str, Any]:
        for aid in agent_ids:
            if WorkbenchStore.get_agent(aid) is None:
                return {"error": f"Agent {aid} not found"}
        team = WorkbenchStore.create_team(name, agent_ids, shared_goal)
        return {"team_id": team.id, "name": team.name, "agents": team.agents}

    def get_team_status(self, team_id: str) -> Dict[str, Any]:
        team = WorkbenchStore.get_team(team_id)
        if team is None:
            return {"error": f"Team {team_id} not found"}
        agent_statuses = []
        for aid in team.agents:
            agent_statuses.append(self.get_status(aid))
        return {
            "team_id": team.id,
            "name": team.name,
            "shared_goal": team.shared_goal,
            "status": team.status,
            "agents": agent_statuses,
        }

    def get_team_activities(self, team_id: str, from_line: int = 0) -> Dict[str, Any]:
        team = WorkbenchStore.get_team(team_id)
        if team is None:
            return {"error": f"Team {team_id} not found"}
        all_activities: List[Dict[str, Any]] = []
        for aid in team.agents:
            logger = self._loggers.get(aid) or ActivityLogger(aid)
            all_activities.extend(logger.get_activities(from_line))
        all_activities.sort(key=lambda a: a.get("timestamp", ""))
        return {"team_id": team.id, "activities": all_activities}

    # ── Accessors for API layer ─────────────────────────────────

    def get_logger(self, agent_id: str) -> ActivityLogger:
        if agent_id not in self._loggers:
            self._loggers[agent_id] = ActivityLogger(agent_id)
        return self._loggers[agent_id]

    def get_memory(self, agent_id: str) -> MemoryStore:
        if agent_id not in self._memories:
            self._memories[agent_id] = MemoryStore(agent_id)
        return self._memories[agent_id]
