"""
Workbench data models – file-based CRUD for autonomous agents and teams.
Storage layout:
  uploads/workbench/agents/{id}/agent.json
  uploads/workbench/teams/{id}/team.json
"""

import os
import json
import uuid
from datetime import datetime
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional

from ..config import Config


@dataclass
class AgentModel:
    id: str
    name: str
    role: str
    goals: List[str] = field(default_factory=list)
    tools: List[str] = field(default_factory=list)
    status: str = "idle"
    created_at: str = ""
    task: Optional[str] = None
    memory_size: int = 0
    artifacts_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "goals": self.goals,
            "tools": self.tools,
            "status": self.status,
            "created_at": self.created_at,
            "task": self.task,
            "memory_size": self.memory_size,
            "artifacts_count": self.artifacts_count,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AgentModel":
        return cls(
            id=data["id"],
            name=data.get("name", ""),
            role=data.get("role", ""),
            goals=data.get("goals", []),
            tools=data.get("tools", []),
            status=data.get("status", "idle"),
            created_at=data.get("created_at", ""),
            task=data.get("task"),
            memory_size=data.get("memory_size", 0),
            artifacts_count=data.get("artifacts_count", 0),
        )


@dataclass
class TeamModel:
    id: str
    name: str
    agents: List[str] = field(default_factory=list)
    shared_goal: str = ""
    status: str = "idle"
    created_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "agents": self.agents,
            "shared_goal": self.shared_goal,
            "status": self.status,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TeamModel":
        return cls(
            id=data["id"],
            name=data.get("name", ""),
            agents=data.get("agents", []),
            shared_goal=data.get("shared_goal", ""),
            status=data.get("status", "idle"),
            created_at=data.get("created_at", ""),
        )


class WorkbenchStore:
    """File-based CRUD for agents and teams."""

    BASE_DIR = os.path.join(Config.UPLOAD_FOLDER, "workbench")
    AGENTS_DIR = os.path.join(BASE_DIR, "agents")
    TEAMS_DIR = os.path.join(BASE_DIR, "teams")
    MESSAGES_DIR = os.path.join(BASE_DIR, "messages")

    @classmethod
    def _ensure_dirs(cls):
        for d in (cls.AGENTS_DIR, cls.TEAMS_DIR, cls.MESSAGES_DIR):
            os.makedirs(d, exist_ok=True)

    # ── Agent CRUD ───────────────────────────────────────────────

    @classmethod
    def create_agent(cls, name: str, role: str, goals: List[str], tools: List[str]) -> AgentModel:
        cls._ensure_dirs()
        agent_id = f"agent_{uuid.uuid4().hex[:12]}"
        now = datetime.now().isoformat()
        agent = AgentModel(
            id=agent_id, name=name, role=role,
            goals=goals, tools=tools,
            status="idle", created_at=now,
        )
        agent_dir = os.path.join(cls.AGENTS_DIR, agent_id)
        os.makedirs(agent_dir, exist_ok=True)
        os.makedirs(os.path.join(agent_dir, "files"), exist_ok=True)
        cls._save_agent(agent)
        return agent

    @classmethod
    def get_agent(cls, agent_id: str) -> Optional[AgentModel]:
        meta = os.path.join(cls.AGENTS_DIR, agent_id, "agent.json")
        if not os.path.exists(meta):
            return None
        try:
            with open(meta, "r", encoding="utf-8") as f:
                return AgentModel.from_dict(json.load(f))
        except Exception:
            return None

    @classmethod
    def update_agent(cls, agent: AgentModel) -> None:
        cls._save_agent(agent)

    @classmethod
    def list_agents(cls, limit: int = 100) -> List[AgentModel]:
        cls._ensure_dirs()
        agents: List[AgentModel] = []
        try:
            for name in os.listdir(cls.AGENTS_DIR):
                a = cls.get_agent(name)
                if a:
                    agents.append(a)
        except Exception:
            pass
        agents.sort(key=lambda a: a.created_at, reverse=True)
        return agents[:limit]

    @classmethod
    def delete_agent(cls, agent_id: str) -> bool:
        import shutil
        agent_dir = os.path.join(cls.AGENTS_DIR, agent_id)
        if os.path.isdir(agent_dir):
            shutil.rmtree(agent_dir, ignore_errors=True)
            return True
        return False

    @classmethod
    def _save_agent(cls, agent: AgentModel) -> None:
        agent_dir = os.path.join(cls.AGENTS_DIR, agent.id)
        os.makedirs(agent_dir, exist_ok=True)
        meta = os.path.join(agent_dir, "agent.json")
        with open(meta, "w", encoding="utf-8") as f:
            json.dump(agent.to_dict(), f, ensure_ascii=False, indent=2)

    # ── Team CRUD ────────────────────────────────────────────────

    @classmethod
    def create_team(cls, name: str, agents: List[str], shared_goal: str) -> TeamModel:
        cls._ensure_dirs()
        team_id = f"team_{uuid.uuid4().hex[:12]}"
        now = datetime.now().isoformat()
        team = TeamModel(
            id=team_id, name=name, agents=agents,
            shared_goal=shared_goal, status="idle", created_at=now,
        )
        team_dir = os.path.join(cls.TEAMS_DIR, team_id)
        os.makedirs(team_dir, exist_ok=True)
        cls._save_team(team)
        return team

    @classmethod
    def get_team(cls, team_id: str) -> Optional[TeamModel]:
        meta = os.path.join(cls.TEAMS_DIR, team_id, "team.json")
        if not os.path.exists(meta):
            return None
        try:
            with open(meta, "r", encoding="utf-8") as f:
                return TeamModel.from_dict(json.load(f))
        except Exception:
            return None

    @classmethod
    def update_team(cls, team: TeamModel) -> None:
        cls._save_team(team)

    @classmethod
    def list_teams(cls, limit: int = 100) -> List[TeamModel]:
        cls._ensure_dirs()
        teams: List[TeamModel] = []
        try:
            for name in os.listdir(cls.TEAMS_DIR):
                t = cls.get_team(name)
                if t:
                    teams.append(t)
        except Exception:
            pass
        teams.sort(key=lambda t: t.created_at, reverse=True)
        return teams[:limit]

    @classmethod
    def _save_team(cls, team: TeamModel) -> None:
        team_dir = os.path.join(cls.TEAMS_DIR, team.id)
        os.makedirs(team_dir, exist_ok=True)
        meta = os.path.join(team_dir, "team.json")
        with open(meta, "w", encoding="utf-8") as f:
            json.dump(team.to_dict(), f, ensure_ascii=False, indent=2)

    # ── Agent data directory helpers ─────────────────────────────

    @classmethod
    def agent_dir(cls, agent_id: str) -> str:
        return os.path.join(cls.AGENTS_DIR, agent_id)

    @classmethod
    def agent_files_dir(cls, agent_id: str) -> str:
        d = os.path.join(cls.AGENTS_DIR, agent_id, "files")
        os.makedirs(d, exist_ok=True)
        return d
