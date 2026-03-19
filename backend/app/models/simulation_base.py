"""
Unified simulation model (file-based, like project.py)
Stores simulation metadata as JSON on disk so every engine
shares the same persistence layer.
"""

import os
import json
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field, asdict

from ..config import Config
from ..services.simulation_framework import SimStatus


@dataclass
class Simulation:
    """Unified simulation data model."""

    id: str
    mode: str
    name: str
    status: SimStatus
    config: Dict[str, Any]
    created_at: str
    updated_at: str
    population_count: int = 0
    actions_count: int = 0
    report_id: Optional[str] = None
    error: Optional[str] = None
    progress: int = 0
    current_round: int = 0
    total_rounds: int = 0
    phase: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "mode": self.mode,
            "name": self.name,
            "status": self.status.value if isinstance(self.status, SimStatus) else self.status,
            "config": self.config,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "population_count": self.population_count,
            "actions_count": self.actions_count,
            "report_id": self.report_id,
            "error": self.error,
            "progress": self.progress,
            "current_round": self.current_round,
            "total_rounds": self.total_rounds,
            "phase": self.phase,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Simulation":
        status = data.get("status", "pending")
        if isinstance(status, str):
            status = SimStatus(status)

        return cls(
            id=data["id"],
            mode=data.get("mode", "document"),
            name=data.get("name", "Untitled Simulation"),
            status=status,
            config=data.get("config", {}),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
            population_count=data.get("population_count", 0),
            actions_count=data.get("actions_count", 0),
            report_id=data.get("report_id"),
            error=data.get("error"),
            progress=data.get("progress", 0),
            current_round=data.get("current_round", 0),
            total_rounds=data.get("total_rounds", 0),
            phase=data.get("phase", ""),
        )


class SimulationStore:
    """File-based CRUD for unified simulations."""

    SIMS_DIR = os.path.join(Config.UPLOAD_FOLDER, "unified_simulations")

    @classmethod
    def _ensure_dir(cls):
        os.makedirs(cls.SIMS_DIR, exist_ok=True)

    @classmethod
    def _sim_dir(cls, sim_id: str) -> str:
        return os.path.join(cls.SIMS_DIR, sim_id)

    @classmethod
    def _meta_path(cls, sim_id: str) -> str:
        return os.path.join(cls._sim_dir(sim_id), "simulation.json")

    @classmethod
    def get_data_dir(cls, sim_id: str) -> str:
        """Return (and create) the data directory for a simulation."""
        d = os.path.join(cls._sim_dir(sim_id), "data")
        os.makedirs(d, exist_ok=True)
        return d

    # ---- CRUD ----------------------------------------------------------

    @classmethod
    def create(cls, mode: str, name: str, config: Dict[str, Any]) -> Simulation:
        cls._ensure_dir()

        sim_id = f"usim_{uuid.uuid4().hex[:12]}"
        now = datetime.now().isoformat()

        sim = Simulation(
            id=sim_id,
            mode=mode,
            name=name,
            status=SimStatus.PENDING,
            config=config,
            created_at=now,
            updated_at=now,
        )

        sim_dir = cls._sim_dir(sim_id)
        os.makedirs(sim_dir, exist_ok=True)
        cls._save(sim)
        return sim

    @classmethod
    def get(cls, sim_id: str) -> Optional[Simulation]:
        meta = cls._meta_path(sim_id)
        if not os.path.exists(meta):
            return None
        with open(meta, "r", encoding="utf-8") as f:
            return Simulation.from_dict(json.load(f))

    @classmethod
    def update_status(
        cls,
        sim_id: str,
        status: SimStatus,
        *,
        error: Optional[str] = None,
        population_count: Optional[int] = None,
        actions_count: Optional[int] = None,
        report_id: Optional[str] = None,
        progress: Optional[int] = None,
        current_round: Optional[int] = None,
        total_rounds: Optional[int] = None,
        phase: Optional[str] = None,
    ) -> Optional[Simulation]:
        sim = cls.get(sim_id)
        if sim is None:
            return None

        sim.status = status
        if error is not None:
            sim.error = error
        if population_count is not None:
            sim.population_count = population_count
        if actions_count is not None:
            sim.actions_count = actions_count
        if report_id is not None:
            sim.report_id = report_id
        if progress is not None:
            sim.progress = progress
        if current_round is not None:
            sim.current_round = current_round
        if total_rounds is not None:
            sim.total_rounds = total_rounds
        if phase is not None:
            sim.phase = phase

        cls._save(sim)
        return sim

    @classmethod
    def list_all(cls, limit: int = 50) -> List[Simulation]:
        cls._ensure_dir()
        sims: List[Simulation] = []
        for name in os.listdir(cls.SIMS_DIR):
            s = cls.get(name)
            if s:
                sims.append(s)
        sims.sort(key=lambda s: s.created_at, reverse=True)
        return sims[:limit]

    # ---- internal helpers ----------------------------------------------

    @classmethod
    def _save(cls, sim: Simulation) -> None:
        sim.updated_at = datetime.now().isoformat()
        meta = cls._meta_path(sim.id)
        os.makedirs(os.path.dirname(meta), exist_ok=True)
        with open(meta, "w", encoding="utf-8") as f:
            json.dump(sim.to_dict(), f, ensure_ascii=False, indent=2)
