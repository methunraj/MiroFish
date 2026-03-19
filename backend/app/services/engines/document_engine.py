"""
Document simulation engine
Wraps the existing SimulationManager / SimulationRunner so the unified
API can drive "document" mode simulations through the same interface.
"""

import os
import json
import threading
from typing import List, Optional

from ..simulation_framework import (
    SimulationEngine,
    SimStatus,
    AgentPersona,
    Action,
)
from ..simulation_manager import SimulationManager, SimulationStatus
from ..simulation_runner import SimulationRunner, RunnerStatus
from ...models.simulation_base import SimulationStore
from ...models.project import ProjectManager
from ...utils.logger import get_logger

logger = get_logger("parallelworld.engines.document")


def _runner_to_sim_status(runner: RunnerStatus) -> SimStatus:
    """Map existing RunnerStatus to the unified SimStatus."""
    mapping = {
        RunnerStatus.IDLE: SimStatus.PENDING,
        RunnerStatus.STARTING: SimStatus.RUNNING,
        RunnerStatus.RUNNING: SimStatus.RUNNING,
        RunnerStatus.PAUSED: SimStatus.STOPPED,
        RunnerStatus.STOPPING: SimStatus.STOPPED,
        RunnerStatus.STOPPED: SimStatus.STOPPED,
        RunnerStatus.COMPLETED: SimStatus.COMPLETED,
        RunnerStatus.FAILED: SimStatus.FAILED,
    }
    return mapping.get(runner, SimStatus.PENDING)


def _sim_manager_to_sim_status(status: SimulationStatus) -> SimStatus:
    mapping = {
        SimulationStatus.CREATED: SimStatus.PENDING,
        SimulationStatus.PREPARING: SimStatus.GENERATING_POPULATION,
        SimulationStatus.READY: SimStatus.PENDING,
        SimulationStatus.RUNNING: SimStatus.RUNNING,
        SimulationStatus.PAUSED: SimStatus.STOPPED,
        SimulationStatus.STOPPED: SimStatus.STOPPED,
        SimulationStatus.COMPLETED: SimStatus.COMPLETED,
        SimulationStatus.FAILED: SimStatus.FAILED,
    }
    return mapping.get(status, SimStatus.PENDING)


class DocumentSimEngine(SimulationEngine):
    """
    Engine for document-based simulations.

    Delegates to the legacy SimulationManager (population / prepare) and
    SimulationRunner (run / stop / actions).
    """

    def __init__(self):
        self._manager = SimulationManager()

    # ------------------------------------------------------------------
    # Population
    # ------------------------------------------------------------------

    def generate_population(self, sim_id: str, config: dict) -> list[AgentPersona]:
        """
        Kick off population generation via SimulationManager.prepare_simulation
        in a background thread.  Returns the current (possibly empty) population
        synchronously so the caller can poll status later.
        """
        unified = SimulationStore.get(sim_id)
        if not unified:
            raise ValueError(f"Unified simulation not found: {sim_id}")

        project_id = config.get("project_id")
        graph_id = config.get("graph_id")

        if not project_id or not graph_id:
            raise ValueError("config must contain project_id and graph_id")

        legacy_state = self._manager.get_simulation(config.get("legacy_sim_id", ""))
        if legacy_state is None:
            legacy_state = self._manager.create_simulation(
                project_id=project_id,
                graph_id=graph_id,
                enable_twitter=config.get("enable_twitter", True),
                enable_reddit=config.get("enable_reddit", True),
            )
            new_cfg = {**unified.config, "legacy_sim_id": legacy_state.simulation_id}
            SimulationStore.update_status(sim_id, SimStatus.GENERATING_POPULATION)
            s = SimulationStore.get(sim_id)
            if s:
                s.config = new_cfg
                SimulationStore._save(s)

        project = ProjectManager.get_project(project_id)
        simulation_requirement = (project.simulation_requirement or "") if project else ""
        document_text = ProjectManager.get_extracted_text(project_id) or ""

        SimulationStore.update_status(sim_id, SimStatus.GENERATING_POPULATION)

        def _bg():
            try:
                self._manager.prepare_simulation(
                    simulation_id=legacy_state.simulation_id,
                    simulation_requirement=simulation_requirement,
                    document_text=document_text,
                    defined_entity_types=config.get("entity_types"),
                    use_llm_for_profiles=config.get("use_llm_for_profiles", True),
                    parallel_profile_count=config.get("parallel_profile_count", 5),
                )
                profiles = self._manager.get_profiles(legacy_state.simulation_id, platform="reddit")
                SimulationStore.update_status(
                    sim_id,
                    SimStatus.PENDING,
                    population_count=len(profiles),
                )
            except Exception as exc:
                logger.error(f"Population generation failed for {sim_id}: {exc}")
                SimulationStore.update_status(sim_id, SimStatus.FAILED, error=str(exc))

        threading.Thread(target=_bg, daemon=True).start()

        return self._load_population(sim_id, config)

    # ------------------------------------------------------------------
    # Run
    # ------------------------------------------------------------------

    def run(self, sim_id: str, population: list[AgentPersona], config: dict) -> None:
        legacy_sim_id = config.get("legacy_sim_id")
        if not legacy_sim_id:
            raise ValueError("config is missing legacy_sim_id — generate_population first")

        platform = config.get("platform", "parallel")
        max_rounds = config.get("max_rounds")

        SimulationRunner.start_simulation(
            simulation_id=legacy_sim_id,
            platform=platform,
            max_rounds=max_rounds,
        )
        SimulationStore.update_status(sim_id, SimStatus.RUNNING)

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_status(self, sim_id: str) -> dict:
        unified = SimulationStore.get(sim_id)
        if not unified:
            return {"error": "not found"}

        result = unified.to_dict()

        legacy_sim_id = unified.config.get("legacy_sim_id")
        if legacy_sim_id:
            run_state = SimulationRunner.get_run_state(legacy_sim_id)
            if run_state:
                result["runner"] = run_state.to_dict()
                new_status = _runner_to_sim_status(run_state.runner_status)
                if new_status != unified.status:
                    SimulationStore.update_status(sim_id, new_status)
                    result["status"] = new_status.value
            else:
                mgr_state = self._manager.get_simulation(legacy_sim_id)
                if mgr_state:
                    result["manager"] = mgr_state.to_simple_dict()

        return result

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    def get_actions(self, sim_id: str, from_line: int = 0) -> list[Action]:
        legacy_sim_id = self._legacy_id(sim_id)
        if not legacy_sim_id:
            return []

        raw = SimulationRunner.get_all_actions(simulation_id=legacy_sim_id)
        actions: list[Action] = []
        for i, a in enumerate(raw):
            if i < from_line:
                continue
            actions.append(Action(
                round=a.round_num,
                agent_id=str(a.agent_id),
                agent_name=a.agent_name,
                action_type=a.action_type,
                content=json.dumps(a.action_args) if a.action_args else "",
                metadata={"platform": a.platform, "success": a.success, "result": a.result},
                timestamp=a.timestamp,
            ))
        return actions

    # ------------------------------------------------------------------
    # Viz data (not yet wired)
    # ------------------------------------------------------------------

    def get_viz_data(self, sim_id: str, viz_type: str) -> dict:
        raise NotImplementedError("Visualization data is not yet connected for document engine")

    # ------------------------------------------------------------------
    # Stop
    # ------------------------------------------------------------------

    def stop(self, sim_id: str) -> None:
        legacy_sim_id = self._legacy_id(sim_id)
        if not legacy_sim_id:
            raise ValueError(f"No legacy simulation found for {sim_id}")
        SimulationRunner.stop_simulation(legacy_sim_id)
        SimulationStore.update_status(sim_id, SimStatus.STOPPED)

    # ------------------------------------------------------------------
    # Report
    # ------------------------------------------------------------------

    def generate_report(self, sim_id: str) -> dict:
        legacy_sim_id = self._legacy_id(sim_id)
        if not legacy_sim_id:
            raise ValueError(f"No legacy simulation found for {sim_id}")
        return {
            "sim_id": sim_id,
            "legacy_sim_id": legacy_sim_id,
            "message": "Use /api/report/generate with the legacy_sim_id to generate a report.",
        }

    # ------------------------------------------------------------------
    # Chat (not yet wired)
    # ------------------------------------------------------------------

    def chat(self, sim_id: str, message: str, history: list) -> str:
        raise NotImplementedError("Chat is not yet connected for document engine")

    # ------------------------------------------------------------------
    # Population retrieval helper
    # ------------------------------------------------------------------

    def get_population(self, sim_id: str, config: dict) -> list[AgentPersona]:
        return self._load_population(sim_id, config)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _legacy_id(self, sim_id: str) -> Optional[str]:
        unified = SimulationStore.get(sim_id)
        if unified:
            return unified.config.get("legacy_sim_id")
        return None

    def _load_population(self, sim_id: str, config: dict) -> list[AgentPersona]:
        legacy_sim_id = config.get("legacy_sim_id")
        if not legacy_sim_id:
            return []

        try:
            profiles = self._manager.get_profiles(legacy_sim_id, platform="reddit")
        except Exception:
            return []

        personas: list[AgentPersona] = []
        for i, p in enumerate(profiles):
            personas.append(AgentPersona(
                id=str(p.get("agent_id", i)),
                name=p.get("user_name", p.get("name", f"Agent_{i}")),
                role=p.get("role", ""),
                demographics={
                    "age": p.get("age"),
                    "gender": p.get("gender"),
                    "education": p.get("education"),
                    "occupation": p.get("occupation"),
                },
                personality={
                    "mbti": p.get("mbti"),
                    "bio": p.get("bio"),
                },
                portrait_url=p.get("profile_image", ""),
                metadata=p,
            ))
        return personas
