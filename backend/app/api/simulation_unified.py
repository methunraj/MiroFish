"""
Unified Simulation API blueprint
Routes all simulation modes through the engine registry so callers
use a single set of endpoints regardless of the underlying engine.
"""

import json
import os
import traceback
import threading
import time
from datetime import datetime
from flask import Blueprint, request, jsonify

from ..models.simulation_base import SimulationStore, SimStatus
from ..services.engines import get_engine, list_engines
from ..services.simulation_framework import SIMULATION_MODES
from ..utils.logger import get_logger

logger = get_logger("parallelworld.api.sim_unified")

sim_unified_bp = Blueprint("sim_unified", __name__)


def _auto_run_pipeline(sim_id: str, mode: str, config: dict):
    """Background task: generate population → wait → run simulation."""
    try:
        engine = get_engine(mode)
        logger.info(f"[{sim_id}] Auto-start: generating population...")
        engine.generate_population(sim_id, config)

        for _ in range(120):
            time.sleep(2)
            sim = SimulationStore.get(sim_id)
            if not sim:
                return
            if sim.status == SimStatus.FAILED or sim.status == SimStatus.STOPPED:
                return
            if sim.status == SimStatus.PENDING and sim.population_count > 0:
                break

        sim = SimulationStore.get(sim_id)
        if not sim or sim.population_count == 0:
            logger.warning(f"[{sim_id}] Population generation did not complete")
            return

        logger.info(f"[{sim_id}] Auto-start: running simulation with {sim.population_count} agents...")
        engine.run(sim_id, [], config)

    except Exception as exc:
        logger.error(f"[{sim_id}] Auto-run pipeline failed: {exc}")
        SimulationStore.update_status(sim_id, SimStatus.FAILED, error=str(exc))


# ------------------------------------------------------------------ #
# POST /api/sim/create
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/create", methods=["POST"])
def create_simulation():
    """
    Create and auto-start a unified simulation.

    Request JSON:
        {
            "mode": "document",
            "name": "My Simulation",   // optional
            "config": { ... }          // mode-specific config
        }
    """
    try:
        data = request.get_json() or {}
        mode = data.get("mode", "document")

        if mode not in SIMULATION_MODES:
            return jsonify({
                "success": False,
                "error": f"Unknown mode '{mode}'. Available: {SIMULATION_MODES}",
            }), 400

        try:
            get_engine(mode)
        except KeyError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

        name = data.get("name", f"{mode} simulation")
        config = data.get("config", {})

        sim = SimulationStore.create(mode=mode, name=name, config=config)

        if mode != "document":
            threading.Thread(
                target=_auto_run_pipeline,
                args=(sim.id, mode, config),
                daemon=True,
            ).start()

        return jsonify({"success": True, "data": sim.to_dict()})

    except Exception as exc:
        logger.error(f"Failed to create simulation: {exc}")
        return jsonify({
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }), 500


# ------------------------------------------------------------------ #
# GET /api/sim/<id>/status
# ------------------------------------------------------------------ #

def _is_stale(sim, status_data: dict) -> bool:
    """True if sim is running/generating_population but updated_at is >60s old."""
    s = status_data.get("status") or (sim.status.value if isinstance(sim.status, SimStatus) else str(sim.status))
    if s not in ("running", "generating_population"):
        return False
    updated = status_data.get("updated_at") or getattr(sim, "updated_at", None)
    if not updated:
        return False
    try:
        dt = datetime.fromisoformat(str(updated).replace("Z", ""))
        now = datetime.now()
        age = (now - dt).total_seconds()
        return age > 60
    except (ValueError, TypeError):
        return False


@sim_unified_bp.route("/<sim_id>/status", methods=["GET"])
def get_status(sim_id: str):
    try:
        sim = SimulationStore.get(sim_id)
        if not sim:
            return jsonify({"success": False, "error": f"Simulation not found: {sim_id}"}), 404

        engine = get_engine(sim.mode)
        status = engine.get_status(sim_id)

        if isinstance(status, dict) and not status.get("error"):
            stale = _is_stale(sim, status)
            if stale:
                status["stale"] = True

        return jsonify({"success": True, "data": status})

    except KeyError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error(f"Failed to get status for {sim_id}: {exc}")
        return jsonify({
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }), 500


# ------------------------------------------------------------------ #
# GET /api/sim/<id>/actions
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/actions", methods=["GET"])
def get_actions(sim_id: str):
    try:
        sim = SimulationStore.get(sim_id)
        if not sim:
            return jsonify({"success": False, "error": f"Simulation not found: {sim_id}"}), 404

        from_line = request.args.get("from_line", 0, type=int)

        engine = get_engine(sim.mode)
        actions = engine.get_actions(sim_id, from_line=from_line)

        return jsonify({
            "success": True,
            "data": {
                "count": len(actions),
                "actions": [
                    {
                        "round": a.round,
                        "agent_id": a.agent_id,
                        "agent_name": a.agent_name,
                        "action_type": a.action_type,
                        "content": a.content,
                        "metadata": a.metadata,
                        "timestamp": a.timestamp,
                    }
                    for a in actions
                ],
            },
        })

    except KeyError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error(f"Failed to get actions for {sim_id}: {exc}")
        return jsonify({
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }), 500


# ------------------------------------------------------------------ #
# GET /api/sim/<id>/viz-data
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/viz-data", methods=["GET"])
def get_viz_data(sim_id: str):
    try:
        sim = SimulationStore.get(sim_id)
        if not sim:
            return jsonify({"success": False, "error": f"Simulation not found: {sim_id}"}), 404

        viz_type = request.args.get("type", "default")

        engine = get_engine(sim.mode)
        data = engine.get_viz_data(sim_id, viz_type=viz_type)

        return jsonify({"success": True, "data": data})

    except NotImplementedError as exc:
        return jsonify({"success": False, "error": str(exc)}), 501
    except KeyError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error(f"Failed to get viz data for {sim_id}: {exc}")
        return jsonify({
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }), 500


# ------------------------------------------------------------------ #
# POST /api/sim/<id>/stop
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/stop", methods=["POST"])
def stop_simulation(sim_id: str):
    try:
        sim = SimulationStore.get(sim_id)
        if not sim:
            return jsonify({"success": False, "error": f"Simulation not found: {sim_id}"}), 404

        engine = get_engine(sim.mode)
        engine.stop(sim_id)

        sim = SimulationStore.get(sim_id)
        return jsonify({"success": True, "data": sim.to_dict() if sim else {}})

    except KeyError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error(f"Failed to stop simulation {sim_id}: {exc}")
        return jsonify({
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }), 500


# ------------------------------------------------------------------ #
# POST /api/sim/<id>/force-complete
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/force-complete", methods=["POST"])
def force_complete_simulation(sim_id: str):
    """
    Force a running or stuck simulation to completed state so the user can
    proceed to generate a report with whatever data was collected.
    """
    try:
        sim = SimulationStore.get(sim_id)
        if not sim:
            return jsonify({"success": False, "error": f"Simulation not found: {sim_id}"}), 404

        if sim.status not in (SimStatus.RUNNING, SimStatus.GENERATING_POPULATION):
            return jsonify({
                "success": False,
                "error": f"Cannot force-complete: simulation is {sim.status.value}, not running",
            }), 400

        SimulationStore.update_status(sim_id, SimStatus.COMPLETED)
        sim = SimulationStore.get(sim_id)
        return jsonify({"success": True, "data": sim.to_dict() if sim else {}})

    except KeyError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error(f"Failed to force-complete simulation {sim_id}: {exc}")
        return jsonify({
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }), 500


# ------------------------------------------------------------------ #
# POST /api/sim/<id>/report   &   GET /api/sim/<id>/report
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/report", methods=["POST"])
def generate_report(sim_id: str):
    try:
        sim = SimulationStore.get(sim_id)
        if not sim:
            return jsonify({"success": False, "error": f"Simulation not found: {sim_id}"}), 404

        engine = get_engine(sim.mode)
        report = engine.generate_report(sim_id)

        return jsonify({"success": True, "data": report})

    except KeyError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except NotImplementedError as exc:
        return jsonify({"success": False, "error": str(exc)}), 501
    except Exception as exc:
        logger.error(f"Failed to generate report for {sim_id}: {exc}")
        return jsonify({
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }), 500


@sim_unified_bp.route("/<sim_id>/report", methods=["GET"])
def get_report(sim_id: str):
    try:
        sim = SimulationStore.get(sim_id)
        if not sim:
            return jsonify({"success": False, "error": f"Simulation not found: {sim_id}"}), 404

        data_dir = SimulationStore.get_data_dir(sim_id)
        report_path = os.path.join(data_dir, "report.json")

        if os.path.exists(report_path):
            with open(report_path, "r", encoding="utf-8") as f:
                report_data = json.load(f)
            report_data["status"] = "completed"
            report_data["report_id"] = sim.report_id or sim_id
            score = report_data.get("viability_score", report_data.get("adoption_score", report_data.get("gdp_delta")))
            if score is not None:
                report_data["score"] = score
            return jsonify({"success": True, "data": report_data})

        if sim.report_id:
            return jsonify({
                "success": True,
                "data": {"report_id": sim.report_id, "sim_id": sim_id, "status": "generating"},
            })

        return jsonify({
            "success": True,
            "data": {"report_id": None, "sim_id": sim_id, "status": "pending", "message": "No report generated yet"},
        })

    except Exception as exc:
        logger.error(f"Failed to get report for {sim_id}: {exc}")
        return jsonify({
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }), 500


# ------------------------------------------------------------------ #
# GET /api/sim/<id>/population
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/population", methods=["GET"])
def get_population(sim_id: str):
    try:
        sim = SimulationStore.get(sim_id)
        if not sim:
            return jsonify({"success": False, "error": f"Simulation not found: {sim_id}"}), 404

        engine = get_engine(sim.mode)

        if hasattr(engine, "get_population"):
            personas = engine.get_population(sim_id, sim.config)
        else:
            personas = []

        return jsonify({
            "success": True,
            "data": {
                "count": len(personas),
                "population": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "role": p.role,
                        "demographics": p.demographics,
                        "personality": p.personality,
                        "portrait_url": p.portrait_url,
                        "metadata": p.metadata,
                    }
                    for p in personas
                ],
            },
        })

    except KeyError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error(f"Failed to get population for {sim_id}: {exc}")
        return jsonify({
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }), 500


# ------------------------------------------------------------------ #
# POST /api/sim/<id>/chat
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/chat", methods=["POST"])
def chat(sim_id: str):
    try:
        sim = SimulationStore.get(sim_id)
        if not sim:
            return jsonify({"success": False, "error": f"Simulation not found: {sim_id}"}), 404

        data = request.get_json() or {}
        message = data.get("message", "")
        history = data.get("history", [])

        if not message:
            return jsonify({"success": False, "error": "message is required"}), 400

        engine = get_engine(sim.mode)
        reply = engine.chat(sim_id, message, history)

        return jsonify({"success": True, "data": {"reply": reply}})

    except NotImplementedError as exc:
        return jsonify({"success": False, "error": str(exc)}), 501
    except KeyError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error(f"Chat failed for {sim_id}: {exc}")
        return jsonify({
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }), 500


# ------------------------------------------------------------------ #
# GET /api/sim/list
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/list", methods=["GET"])
def list_simulations():
    try:
        limit = request.args.get("limit", 50, type=int)
        sims = SimulationStore.list_all(limit=limit)

        return jsonify({
            "success": True,
            "data": [s.to_dict() for s in sims],
            "count": len(sims),
            "engines": list_engines(),
        })

    except Exception as exc:
        logger.error(f"Failed to list simulations: {exc}")
        return jsonify({
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }), 500
