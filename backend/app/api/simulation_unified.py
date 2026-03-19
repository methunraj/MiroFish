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
from flask import Blueprint, request, jsonify, Response, stream_with_context

from ..models.simulation_base import SimulationStore, SimStatus
from ..models.graph_db import get_db_session
from ..models.simulation_db import SimulationEvent, AgentRecord, AgentStateRecord, AgentMemory
from ..models.social_db import SocialPost, PostReaction, DiscussionThread, ThreadComment, AgentDebate, DebateTurn, TrendingTopic
from ..services.engines import get_engine, list_engines
from ..services.simulation_framework import SIMULATION_MODES
from ..utils.logger import get_logger

logger = get_logger("parallelworld.api.sim_unified")

sim_unified_bp = Blueprint("sim_unified", __name__)


SIM_PRESETS = {
    "quick": {"total_simulation_hours": 1, "max_rounds": 4, "population_size": 15, "minutes_per_round": 15},
    "standard": {"total_simulation_hours": 4, "max_rounds": 12, "population_size": 50, "minutes_per_round": 20},
    "deep": {"total_simulation_hours": 12, "max_rounds": 30, "population_size": 100, "minutes_per_round": 24},
}


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

        try:
            logger.info(f"[{sim_id}] Auto-generating report...")
            engine.generate_report(sim_id)
            logger.info(f"[{sim_id}] Report generated successfully")
        except Exception as exc:
            logger.warning(f"[{sim_id}] Report generation failed: {exc}")

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

        preset = config.get("sim_preset", "")
        if preset in SIM_PRESETS:
            for k, v in SIM_PRESETS[preset].items():
                config.setdefault(k, v)

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
# POST /api/sim/auto-config
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/auto-config", methods=["POST"])
def auto_config():
    """
    Use LLM to determine optimal simulation config for a given topic.

    Request JSON: { "topic": "...", "mode": "prompt|product|economy" }
    Returns: { "population_size": N, "total_simulation_hours": H, "max_rounds": R, "rationale": "..." }
    """
    try:
        data = request.get_json() or {}
        topic = data.get("topic", "")
        mode = data.get("mode", "prompt")

        if not topic:
            return jsonify({"success": False, "error": "topic is required"}), 400

        from ..utils.llm_client import LLMClient
        llm = LLMClient()

        result = llm.chat_json(messages=[
            {"role": "system", "content": (
                "You are a simulation configuration expert. Given a topic and simulation mode, "
                "determine the optimal configuration. Consider topic complexity, number of stakeholders, "
                "and how much social interaction is needed.\n\n"
                "Return JSON with EXACTLY these fields:\n"
                '- "population_size": integer 10-150 (number of agents)\n'
                '- "total_simulation_hours": integer 1-24 (simulated hours)\n'
                '- "max_rounds": integer 4-40 (simulation rounds)\n'
                '- "minutes_per_round": integer 10-60\n'
                '- "rationale": string (brief explanation of your choices)'
            )},
            {"role": "user", "content": f"Topic: {topic}\nSimulation mode: {mode}"},
        ], temperature=0.3, max_tokens=512)

        pop = min(150, max(10, int(result.get("population_size", 50))))
        hours = min(24, max(1, int(result.get("total_simulation_hours", 4))))
        rounds = min(40, max(4, int(result.get("max_rounds", 12))))
        mpr = min(60, max(10, int(result.get("minutes_per_round", 20))))

        return jsonify({"success": True, "data": {
            "population_size": pop,
            "total_simulation_hours": hours,
            "max_rounds": rounds,
            "minutes_per_round": mpr,
            "rationale": result.get("rationale", "AI-determined configuration"),
        }})

    except Exception as exc:
        logger.error(f"Auto-config failed: {exc}")
        fallback = {**SIM_PRESETS["standard"], "rationale": "Using default config (AI auto-config unavailable)"}
        return jsonify({"success": True, "data": fallback})


# ------------------------------------------------------------------ #
# GET /api/sim/<id>/status
# ------------------------------------------------------------------ #

def _is_stale(sim, status_data: dict) -> bool:
    """True if sim is running/generating_population but updated_at is >60s old.
    If stale for >5 minutes, auto-mark as failed to prevent stuck sims."""
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
        if age > 300:
            logger.warning(f"Simulation {sim.id} stale for {age:.0f}s, auto-marking as failed")
            SimulationStore.update_status(
                sim.id, SimStatus.FAILED,
                error="Simulation appears to have crashed (no updates for 5+ minutes)"
            )
            status_data["status"] = "failed"
            status_data["error"] = "Simulation appears to have crashed (no updates for 5+ minutes)"
            return True
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

            status["current_round"] = sim.current_round
            status["total_rounds"] = sim.total_rounds or sim.config.get("max_rounds", 0)
            status["sim_phase"] = sim.phase

            total_hours = sim.config.get("total_simulation_hours", 0)
            mpr = sim.config.get("minutes_per_round", 30)
            if sim.current_round > 0 and mpr > 0:
                status["simulated_hour"] = round((sim.current_round * mpr) / 60, 1)
            else:
                status["simulated_hour"] = 0
            status["total_hours"] = total_hours

            try:
                with get_db_session() as session:
                    posts_count = session.query(SocialPost).filter_by(sim_id=sim_id).count()
                    threads_count = session.query(DiscussionThread).filter_by(sim_id=sim_id).count()
                    debates_count = session.query(AgentDebate).filter_by(sim_id=sim_id).count()
                    status["social_counts"] = {
                        "posts": posts_count,
                        "threads": threads_count,
                        "debates": debates_count,
                    }
            except Exception:
                status["social_counts"] = {"posts": 0, "threads": 0, "debates": 0}

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
# GET /api/sim/<id>/interviews
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/interviews", methods=["GET"])
def get_interviews(sim_id: str):
    """Return agent interviews for a completed simulation."""
    try:
        data_dir = SimulationStore.get_data_dir(sim_id)
        path = os.path.join(data_dir, "interviews.json")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                interviews = json.load(f)
            return jsonify({"success": True, "data": interviews})
        return jsonify({"success": True, "data": []})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


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


# ------------------------------------------------------------------ #
# GET /api/sim/<id>/stream  -- Server-Sent Events
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/stream", methods=["GET"])
def stream_events(sim_id: str):
    """SSE endpoint for real-time simulation events."""
    def generate():
        last_id = 0
        empty_cycles = 0
        while True:
            try:
                with get_db_session() as session:
                    events = (
                        session.query(SimulationEvent)
                        .filter(
                            SimulationEvent.sim_id == sim_id,
                            SimulationEvent.id > last_id,
                        )
                        .order_by(SimulationEvent.id.asc())
                        .limit(50)
                        .all()
                    )
                    if events:
                        empty_cycles = 0
                        for ev in events:
                            yield f"data: {json.dumps(ev.to_dict())}\n\n"
                            last_id = ev.id
                    else:
                        empty_cycles += 1
                        yield f"data: {json.dumps({'type': 'heartbeat', 'ts': datetime.now().isoformat()})}\n\n"
            except Exception as exc:
                logger.error(f"SSE error for {sim_id}: {exc}")
                yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

            sim = SimulationStore.get(sim_id)
            if sim and sim.status.value in ("completed", "failed", "stopped") and empty_cycles > 5:
                yield f"data: {json.dumps({'type': 'stream_end', 'status': sim.status.value})}\n\n"
                break

            time.sleep(1)

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ------------------------------------------------------------------ #
# GET /api/sim/<id>/social/posts
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/social/posts", methods=["GET"])
def get_social_posts(sim_id: str):
    """Get Twitter-like posts for a simulation."""
    try:
        limit = request.args.get("limit", 50, type=int)
        with get_db_session() as session:
            posts = (
                session.query(SocialPost)
                .filter_by(sim_id=sim_id)
                .order_by(SocialPost.created_at.desc())
                .limit(limit)
                .all()
            )
            result = []
            for p in posts:
                d = p.to_dict()
                agent = session.query(AgentRecord).filter_by(id=p.agent_id).first()
                if agent:
                    d["agent_name"] = agent.name
                    d["agent_portrait"] = agent.portrait_url
                result.append(d)
            return jsonify({"success": True, "data": result})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# ------------------------------------------------------------------ #
# GET /api/sim/<id>/social/threads
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/social/threads", methods=["GET"])
def get_discussion_threads(sim_id: str):
    """Get Reddit-like discussion threads."""
    try:
        with get_db_session() as session:
            threads = (
                session.query(DiscussionThread)
                .filter_by(sim_id=sim_id)
                .order_by(DiscussionThread.score.desc())
                .limit(20)
                .all()
            )
            result = []
            for t in threads:
                d = t.to_dict()
                author = session.query(AgentRecord).filter_by(id=t.author_id).first()
                if author:
                    d["author_name"] = author.name
                    d["author_portrait"] = author.portrait_url
                comments = (
                    session.query(ThreadComment)
                    .filter_by(thread_id=t.id)
                    .order_by(ThreadComment.depth, ThreadComment.score.desc())
                    .all()
                )
                d["comments"] = []
                for c in comments:
                    cd = c.to_dict()
                    comment_author = session.query(AgentRecord).filter_by(id=c.author_id).first()
                    if comment_author:
                        cd["author_name"] = comment_author.name
                        cd["author_portrait"] = comment_author.portrait_url
                    d["comments"].append(cd)
                result.append(d)
            return jsonify({"success": True, "data": result})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# ------------------------------------------------------------------ #
# GET /api/sim/<id>/social/debates
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/social/debates", methods=["GET"])
def get_debates(sim_id: str):
    """Get agent debates with turns."""
    try:
        with get_db_session() as session:
            debates = (
                session.query(AgentDebate)
                .filter_by(sim_id=sim_id)
                .order_by(AgentDebate.created_at.desc())
                .all()
            )
            result = []
            for debate in debates:
                d = debate.to_dict()
                agent_a = session.query(AgentRecord).filter_by(id=debate.agent_a_id).first()
                agent_b = session.query(AgentRecord).filter_by(id=debate.agent_b_id).first()
                if agent_a:
                    d["agent_a_name"] = agent_a.name
                    d["agent_a_portrait"] = agent_a.portrait_url
                if agent_b:
                    d["agent_b_name"] = agent_b.name
                    d["agent_b_portrait"] = agent_b.portrait_url
                result.append(d)
            return jsonify({"success": True, "data": result})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# ------------------------------------------------------------------ #
# GET /api/sim/<id>/social/opinion
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/social/opinion", methods=["GET"])
def get_public_opinion(sim_id: str):
    """Get aggregate public opinion data."""
    try:
        with get_db_session() as session:
            agents = session.query(AgentRecord).filter_by(sim_id=sim_id).all()

            opinion_data = {"agents": [], "factions": {}, "avg_sentiment": 0, "shifts": []}
            total_sentiment = 0
            faction_counts = {}

            for agent in agents:
                state = (
                    session.query(AgentStateRecord)
                    .filter_by(agent_id=agent.id, sim_id=sim_id)
                    .order_by(AgentStateRecord.created_at.desc())
                    .first()
                )
                if state:
                    total_sentiment += state.sentiment or 5
                    faction = state.faction or "Undecided"
                    faction_counts[faction] = faction_counts.get(faction, 0) + 1
                    opinion_data["agents"].append({
                        "id": agent.id,
                        "name": agent.name,
                        "portrait_url": agent.portrait_url,
                        "sentiment": state.sentiment,
                        "faction": state.faction,
                        "mood": state.emotional_state.get("mood", "neutral") if state.emotional_state else "neutral",
                        "influence": state.influence_score,
                    })

            n = len(opinion_data["agents"]) or 1
            opinion_data["avg_sentiment"] = round(total_sentiment / n, 2)
            opinion_data["factions"] = faction_counts

            shifts = (
                session.query(SimulationEvent)
                .filter_by(sim_id=sim_id, event_type="opinion_shift")
                .order_by(SimulationEvent.created_at.desc())
                .limit(50)
                .all()
            )
            opinion_data["shifts"] = [s.to_dict() for s in shifts]

            return jsonify({"success": True, "data": opinion_data})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# ------------------------------------------------------------------ #
# GET /api/sim/<id>/social/trending
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/social/trending", methods=["GET"])
def get_trending(sim_id: str):
    """Get trending topics and viral posts."""
    try:
        with get_db_session() as session:
            trending = (
                session.query(TrendingTopic)
                .filter_by(sim_id=sim_id)
                .order_by(TrendingTopic.virality_score.desc())
                .limit(20)
                .all()
            )

            viral_posts = (
                session.query(SocialPost)
                .filter_by(sim_id=sim_id)
                .order_by(SocialPost.virality_score.desc())
                .limit(10)
                .all()
            )
            viral_result = []
            for p in viral_posts:
                d = p.to_dict()
                agent = session.query(AgentRecord).filter_by(id=p.agent_id).first()
                if agent:
                    d["agent_name"] = agent.name
                    d["agent_portrait"] = agent.portrait_url
                viral_result.append(d)

            return jsonify({"success": True, "data": {
                "topics": [t.to_dict() for t in trending],
                "viral_posts": viral_result,
            }})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# ------------------------------------------------------------------ #
# GET /api/sim/<id>/agents/<agent_id>/spotlight
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/agents/<agent_id>/spotlight", methods=["GET"])
def get_agent_spotlight(sim_id: str, agent_id: str):
    """Get full agent profile for the spotlight overlay."""
    try:
        with get_db_session() as session:
            agent = session.query(AgentRecord).filter_by(id=agent_id, sim_id=sim_id).first()
            if not agent:
                return jsonify({"success": False, "error": "Agent not found"}), 404

            states = (
                session.query(AgentStateRecord)
                .filter_by(agent_id=agent_id, sim_id=sim_id)
                .order_by(AgentStateRecord.created_at)
                .all()
            )

            posts = (
                session.query(SocialPost)
                .filter_by(agent_id=agent_id, sim_id=sim_id)
                .order_by(SocialPost.created_at.desc())
                .limit(20)
                .all()
            )

            debates = (
                session.query(AgentDebate)
                .filter(
                    AgentDebate.sim_id == sim_id,
                    (AgentDebate.agent_a_id == agent_id) | (AgentDebate.agent_b_id == agent_id),
                )
                .all()
            )

            memories = (
                session.query(AgentMemory)
                .filter_by(agent_id=agent_id, sim_id=sim_id)
                .order_by(AgentMemory.importance.desc())
                .limit(15)
                .all()
            )

            return jsonify({"success": True, "data": {
                "agent": agent.to_dict(),
                "states": [s.to_dict() for s in states],
                "emotional_journey": [
                    {"phase": s.phase, "mood": s.emotional_state.get("mood", "neutral") if s.emotional_state else "neutral",
                     "sentiment": s.sentiment, "faction": s.faction}
                    for s in states
                ],
                "posts": [p.to_dict() for p in posts],
                "debates": [d.to_dict() for d in debates],
                "memories": [m.to_dict() for m in memories],
            }})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# ------------------------------------------------------------------ #
# POST /api/sim/<id>/inject-event
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/inject-event", methods=["POST"])
def inject_event(sim_id: str):
    """Inject an external event into a running simulation."""
    try:
        data = request.get_json() or {}
        event_text = data.get("event", data.get("content", ""))
        if not event_text:
            return jsonify({"success": False, "error": "event text is required"}), 400

        sim = SimulationStore.get(sim_id)
        if not sim:
            return jsonify({"success": False, "error": f"Simulation not found: {sim_id}"}), 404
        engine = get_engine(sim.mode)
        if hasattr(engine, 'inject_external_event'):
            engine.inject_external_event(sim_id, event_text)

        return jsonify({"success": True, "data": {"message": f"Event injected: {event_text[:100]}"}})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# ------------------------------------------------------------------ #
# GET /api/sim/<id>/agents/states
# ------------------------------------------------------------------ #

@sim_unified_bp.route("/<sim_id>/agents/states", methods=["GET"])
def get_agent_states(sim_id: str):
    """Get current state of all agents (mood, faction, influence)."""
    try:
        with get_db_session() as session:
            agents = session.query(AgentRecord).filter_by(sim_id=sim_id).all()
            result = []
            for agent in agents:
                state = (
                    session.query(AgentStateRecord)
                    .filter_by(agent_id=agent.id, sim_id=sim_id)
                    .order_by(AgentStateRecord.created_at.desc())
                    .first()
                )
                result.append({
                    "id": agent.id,
                    "name": agent.name,
                    "portrait_url": agent.portrait_url,
                    "role": agent.role,
                    "mood": state.emotional_state.get("mood", "neutral") if state and state.emotional_state else "neutral",
                    "sentiment": state.sentiment if state else 5.0,
                    "faction": state.faction if state else "",
                    "influence": state.influence_score if state else 0.5,
                })
            return jsonify({"success": True, "data": result})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500
