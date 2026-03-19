"""
Workbench API – Flask blueprint for the autonomous agent workbench.
Prefix: /api/workbench
"""

import os
from flask import Blueprint, request, jsonify, send_file

from ..models.workbench import WorkbenchStore
from ..services.autonomous.orchestrator import AgentOrchestrator
from ..services.autonomous.tool_router import ToolRouter

workbench_bp = Blueprint("workbench", __name__)

_orch = AgentOrchestrator()


# ── Agent endpoints ─────────────────────────────────────────────

@workbench_bp.route("/create-agent", methods=["POST"])
def create_agent():
    try:
        data = request.get_json(force=True)
        name = data.get("name", "Agent")
        role = data.get("role", "general")
        goals = data.get("goals", [])
        tools = data.get("tools", [])
        agent = _orch.create_agent(name, role, goals, tools)
        return jsonify({"status": "ok", "agent": agent.to_dict()}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@workbench_bp.route("/deploy", methods=["POST"])
def deploy_agent():
    try:
        data = request.get_json(force=True)
        agent_id = data.get("agent_id")
        task = data.get("task", "")
        if not agent_id:
            return jsonify({"error": "agent_id is required"}), 400
        if not task:
            return jsonify({"error": "task is required"}), 400
        result = _orch.deploy(agent_id, task)
        if "error" in result:
            return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@workbench_bp.route("/<agent_id>/status", methods=["GET"])
def agent_status(agent_id: str):
    try:
        result = _orch.get_status(agent_id)
        if "error" in result:
            return jsonify(result), 404
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@workbench_bp.route("/<agent_id>/activities", methods=["GET"])
def agent_activities(agent_id: str):
    try:
        from_line = request.args.get("from", 0, type=int)
        logger = _orch.get_logger(agent_id)
        activities = logger.get_activities(from_line)
        return jsonify({
            "agent_id": agent_id,
            "activities": activities,
            "total": logger.get_count(),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@workbench_bp.route("/<agent_id>/artifacts", methods=["GET"])
def agent_artifacts(agent_id: str):
    try:
        files_dir = WorkbenchStore.agent_files_dir(agent_id)
        files = []
        for root, _dirs, filenames in os.walk(files_dir):
            for fname in filenames:
                full = os.path.join(root, fname)
                rel = os.path.relpath(full, files_dir)
                files.append({"path": rel, "size": os.path.getsize(full)})
        agent = WorkbenchStore.get_agent(agent_id)
        if agent:
            agent.artifacts_count = len(files)
            WorkbenchStore.update_agent(agent)
        return jsonify({"agent_id": agent_id, "artifacts": files, "count": len(files)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@workbench_bp.route("/<agent_id>/artifacts/<path:filename>", methods=["GET"])
def agent_artifact_file(agent_id: str, filename: str):
    try:
        files_dir = WorkbenchStore.agent_files_dir(agent_id)
        full = os.path.normpath(os.path.join(files_dir, filename))
        if not full.startswith(os.path.normpath(files_dir)):
            return jsonify({"error": "Path traversal not allowed"}), 403
        if not os.path.isfile(full):
            return jsonify({"error": "File not found"}), 404
        return send_file(full)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@workbench_bp.route("/<agent_id>/message", methods=["POST"])
def send_message(agent_id: str):
    try:
        data = request.get_json(force=True)
        content = data.get("content", "")
        from_id = data.get("from_id", "user")
        if not content:
            return jsonify({"error": "content is required"}), 400
        from ..services.autonomous.tools.message_bus import MessageBus
        bus = MessageBus()
        result = bus.send(from_id, agent_id, content)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@workbench_bp.route("/<agent_id>/memory", methods=["GET"])
def agent_memory(agent_id: str):
    try:
        query = request.args.get("query", "")
        memory = _orch.get_memory(agent_id)
        if query:
            results = memory.search(query, limit=10)
        else:
            results = memory.get_recent(limit=20)
        return jsonify({
            "agent_id": agent_id,
            "memories": results,
            "total_size": memory.get_size(),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@workbench_bp.route("/<agent_id>/stop", methods=["POST"])
def stop_agent(agent_id: str):
    try:
        result = _orch.stop(agent_id)
        if "error" in result:
            return jsonify(result), 404
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@workbench_bp.route("/agents", methods=["GET"])
def list_agents():
    try:
        agents = WorkbenchStore.list_agents()
        active = {s["agent_id"] for s in _orch.list_active()}
        agent_list = []
        for a in agents:
            d = a.to_dict()
            d["is_running"] = a.id in active
            agent_list.append(d)
        return jsonify({"agents": agent_list, "count": len(agent_list)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Team endpoints ──────────────────────────────────────────────

@workbench_bp.route("/team/create", methods=["POST"])
def create_team():
    try:
        data = request.get_json(force=True)
        name = data.get("name", "Team")
        agents = data.get("agents", [])
        shared_goal = data.get("shared_goal", "")
        if not agents:
            return jsonify({"error": "agents list is required"}), 400
        result = _orch.create_team(name, agents, shared_goal)
        if "error" in result:
            return jsonify(result), 400
        return jsonify(result), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@workbench_bp.route("/team/<team_id>/status", methods=["GET"])
def team_status(team_id: str):
    try:
        result = _orch.get_team_status(team_id)
        if "error" in result:
            return jsonify(result), 404
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@workbench_bp.route("/team/<team_id>/activities", methods=["GET"])
def team_activities(team_id: str):
    try:
        from_line = request.args.get("from", 0, type=int)
        result = _orch.get_team_activities(team_id, from_line)
        if "error" in result:
            return jsonify(result), 404
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Utility ─────────────────────────────────────────────────────

@workbench_bp.route("/tools", methods=["GET"])
def list_tools():
    try:
        return jsonify({"tools": ToolRouter.list_tools()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
