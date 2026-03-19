"""
Simulation Framework abstraction layer
Defines the common interface that all simulation engines must implement.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any
from enum import Enum


class SimStatus(str, Enum):
    PENDING = "pending"
    GENERATING_POPULATION = "generating_population"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


@dataclass
class AgentPersona:
    id: str
    name: str
    role: str
    demographics: dict = field(default_factory=dict)
    personality: dict = field(default_factory=dict)
    portrait_url: str = ""
    metadata: dict = field(default_factory=dict)


@dataclass
class Action:
    round: int
    agent_id: str
    agent_name: str
    action_type: str
    content: str
    metadata: dict = field(default_factory=dict)
    timestamp: str = ""


SIMULATION_MODES = [
    "document", "prompt", "product_launch", "economy",
]


class SimulationEngine(ABC):
    """Abstract base class for all simulation engines."""

    @abstractmethod
    def generate_population(self, sim_id: str, config: dict) -> list[AgentPersona]:
        ...

    @abstractmethod
    def run(self, sim_id: str, population: list[AgentPersona], config: dict) -> None:
        ...

    @abstractmethod
    def get_status(self, sim_id: str) -> dict:
        ...

    @abstractmethod
    def get_actions(self, sim_id: str, from_line: int = 0) -> list[Action]:
        ...

    @abstractmethod
    def get_viz_data(self, sim_id: str, viz_type: str) -> dict:
        ...

    @abstractmethod
    def stop(self, sim_id: str) -> None:
        ...

    @abstractmethod
    def generate_report(self, sim_id: str) -> dict:
        ...

    @abstractmethod
    def chat(self, sim_id: str, message: str, history: list) -> str:
        ...
