"""
Prompt-based simulation engine for market analysis.
Uses LLM to generate diverse consumer personas and evaluate a business idea.
"""

import os
import json
import threading
import uuid
from datetime import datetime
from typing import List, Optional
from collections import defaultdict

from ..simulation_framework import (
    SimulationEngine,
    SimStatus,
    AgentPersona,
    Action,
)
from .social_mixin import SocialSimulationMixin
from ...models.simulation_base import SimulationStore
from ...utils.llm_client import LLMClient
from ...utils.image_client import get_image_client
from ...utils.logger import get_logger
from ...models.graph_db import get_db_session
from ...models.simulation_db import AgentRecord, SimulationRecord, SimulationEvent

logger = get_logger("parallelworld.engines.prompt")

_stop_flags: dict[str, bool] = {}


class PromptSimEngine(SocialSimulationMixin, SimulationEngine):
    """Market-analysis engine driven entirely by LLM prompts."""

    def __init__(self):
        self.llm = LLMClient()

    # ------------------------------------------------------------------
    # Batched population generation
    # ------------------------------------------------------------------

    def _batched_generate_population(self, idea: str, pop_size: int) -> list[dict]:
        """Generate agents in batches to reliably hit the target count."""
        BATCH_SIZE = 12
        all_agents: list[dict] = []
        max_retries = 5
        retry = 0

        while len(all_agents) < pop_size and retry < max_retries:
            needed = min(BATCH_SIZE, pop_size - len(all_agents))
            existing_names = [a.get("name", "") for a in all_agents]
            avoid_text = ""
            if existing_names:
                avoid_text = f"\nDo NOT reuse these names: {', '.join(existing_names[-20:])}\n"

            messages = [
                {"role": "system", "content": (
                    "You are a market research expert. Generate diverse consumer personas "
                    "for evaluating a business idea. Return valid JSON with a single key "
                    '"agents" containing a list of persona objects.'
                )},
                {"role": "user", "content": (
                    f"Business idea: {idea}\n\n"
                    f"Generate exactly {needed} diverse consumer personas stratified by age "
                    "group (18-25, 26-35, 36-50, 51-65, 65+), income level (low/medium/high), "
                    "occupation variety, and personality type (analytical/expressive/"
                    f"driver/amiable).{avoid_text}\n"
                    "Each persona must have:\n"
                    '- "name": full name\n'
                    '- "age": integer\n'
                    '- "gender": string\n'
                    '- "income_level": low/medium/high\n'
                    '- "annual_income": integer estimate\n'
                    '- "occupation": string\n'
                    '- "education": string\n'
                    '- "personality_type": analytical/expressive/driver/amiable\n'
                    '- "interests": list of strings\n'
                    '- "tech_savviness": 1-10\n'
                    '- "bio": one-sentence background\n'
                    "Return ONLY the JSON."
                )},
            ]

            try:
                result = self.llm.chat_json(messages=messages, temperature=0.85, max_tokens=12000)
                batch = result.get("agents", [])
                name_set = {a.get("name", "").lower() for a in all_agents}
                for a in batch:
                    if a.get("name", "").lower() not in name_set:
                        all_agents.append(a)
                        name_set.add(a.get("name", "").lower())
                logger.info(f"Batch {retry+1}: got {len(batch)} agents, total {len(all_agents)}/{pop_size}")
            except Exception as exc:
                logger.warning(f"Batch generation retry {retry}: {exc}")

            retry += 1

        return all_agents[:pop_size]

    # ------------------------------------------------------------------
    # Population
    # ------------------------------------------------------------------

    def generate_population(self, sim_id: str, config: dict) -> list[AgentPersona]:
        sim = SimulationStore.get(sim_id)
        if not sim:
            raise ValueError(f"Simulation not found: {sim_id}")

        SimulationStore.update_status(sim_id, SimStatus.GENERATING_POPULATION)
        _stop_flags[sim_id] = False

        def _bg():
            try:
                idea = config.get("idea", config.get("business_idea", config.get("prompt", "")))
                pop_size = config.get("population_size", 20)

                agents_raw = self._batched_generate_population(idea, pop_size)

                personas: list[AgentPersona] = []
                for i, a in enumerate(agents_raw):
                    pid = f"agent_{uuid.uuid4().hex[:8]}"
                    personas.append(AgentPersona(
                        id=pid,
                        name=a.get("name", f"Persona_{i}"),
                        role="consumer",
                        demographics={
                            "age": a.get("age"),
                            "gender": a.get("gender"),
                            "income_level": a.get("income_level"),
                            "annual_income": a.get("annual_income"),
                            "occupation": a.get("occupation"),
                            "education": a.get("education"),
                        },
                        personality={
                            "type": a.get("personality_type"),
                            "interests": a.get("interests", []),
                            "tech_savviness": a.get("tech_savviness"),
                        },
                        metadata={"bio": a.get("bio", "")},
                    ))

                data_dir = SimulationStore.get_data_dir(sim_id)
                with open(os.path.join(data_dir, "population.json"), "w", encoding="utf-8") as f:
                    json.dump([_persona_to_dict(p) for p in personas], f, ensure_ascii=False, indent=2)

                # Save agents to DB and generate portraits
                try:
                    image_client = get_image_client()
                    agent_dicts = [{"id": p.id, "name": p.name, "demographics": p.demographics, "personality": p.personality} for p in personas]
                    portrait_map = image_client.generate_portraits_batch(agent_dicts, max_workers=3)

                    with get_db_session() as session:
                        existing = session.query(SimulationRecord).filter_by(id=sim_id).first()
                        if not existing:
                            sim_rec = SimulationRecord(
                                id=sim_id, mode="prompt",
                                name=config.get("name", "Market Analysis"),
                                status="generating_population",
                                config=config,
                            )
                            session.add(sim_rec)
                            session.flush()

                        for p in personas:
                            p.portrait_url = portrait_map.get(p.id, "")
                            agent_rec = AgentRecord(
                                id=p.id, sim_id=sim_id,
                                name=p.name, role=p.role,
                                demographics=p.demographics,
                                personality=p.personality,
                                portrait_url=p.portrait_url,
                                activity_level=0.3 + __import__('random').random() * 0.5,
                                bio=p.metadata.get("bio", ""),
                            )
                            session.add(agent_rec)
                except Exception as portrait_exc:
                    logger.warning(f"[{sim_id}] Portrait/DB save failed (non-fatal): {portrait_exc}")

                SimulationStore.update_status(
                    sim_id, SimStatus.PENDING, population_count=len(personas),
                )
                logger.info(f"[{sim_id}] Generated {len(personas)} personas")

            except Exception as exc:
                logger.error(f"[{sim_id}] Population generation failed: {exc}")
                SimulationStore.update_status(sim_id, SimStatus.FAILED, error=str(exc))

        threading.Thread(target=_bg, daemon=True).start()
        return []

    # ------------------------------------------------------------------
    # Run
    # ------------------------------------------------------------------

    def run(self, sim_id: str, population: list[AgentPersona], config: dict) -> None:
        sim = SimulationStore.get(sim_id)
        if not sim:
            raise ValueError(f"Simulation not found: {sim_id}")

        data_dir = SimulationStore.get_data_dir(sim_id)
        pop_path = os.path.join(data_dir, "population.json")
        if not os.path.exists(pop_path):
            raise ValueError("Population not generated yet — call generate_population first")

        with open(pop_path, "r", encoding="utf-8") as f:
            agents_raw = json.load(f)

        if not population:
            population = [_dict_to_persona(a) for a in agents_raw]

        SimulationStore.update_status(sim_id, SimStatus.RUNNING)
        _stop_flags[sim_id] = False
        idea = config.get("idea", config.get("business_idea", config.get("prompt", "")))
        config.setdefault("total_simulation_hours", 4)
        config.setdefault("max_rounds", 8)
        config.setdefault("minutes_per_round", 30)

        def _bg():
            resp_path = os.path.join(data_dir, "responses.jsonl")
            count = 0
            try:
                with open(resp_path, "w", encoding="utf-8") as fout:
                    for agent in population:
                        if _stop_flags.get(sim_id):
                            logger.info(f"[{sim_id}] Stopped by user")
                            SimulationStore.update_status(sim_id, SimStatus.STOPPED)
                            return

                        demo = agent.demographics
                        persona_desc = (
                            f"Name: {agent.name}, Age: {demo.get('age')}, "
                            f"Gender: {demo.get('gender')}, "
                            f"Occupation: {demo.get('occupation')}, "
                            f"Income: {demo.get('income_level')} "
                            f"(~${demo.get('annual_income', 'N/A')}/yr), "
                            f"Education: {demo.get('education')}, "
                            f"Personality: {agent.personality.get('type')}, "
                            f"Interests: {', '.join(agent.personality.get('interests', []))}, "
                            f"Bio: {agent.metadata.get('bio', '')}"
                        )

                        messages = [
                            {"role": "system", "content": (
                                "You are role-playing as a specific consumer persona. "
                                "Evaluate the business idea honestly from your character's "
                                "perspective. Return valid JSON only."
                            )},
                            {"role": "user", "content": (
                                f"Your persona:\n{persona_desc}\n\n"
                                f"Business idea to evaluate:\n{idea}\n\n"
                                "Respond with JSON containing exactly these fields:\n"
                                '- "interest": integer 1-10\n'
                                '- "willingness_to_pay": dollar amount or "not interested"\n'
                                '- "concerns": list of strings\n'
                                '- "suggestions": list of strings\n'
                                '- "reaction": one of "interested", "neutral", "skeptical"\n'
                                '- "reasoning": brief explanation of your evaluation'
                            )},
                        ]

                        try:
                            resp = self.llm.chat_json(messages=messages, temperature=0.6, max_tokens=1024)
                        except Exception as e:
                            logger.warning(f"[{sim_id}] Agent {agent.id} LLM error: {e}")
                            resp = {
                                "interest": 5, "willingness_to_pay": "unknown",
                                "concerns": ["LLM error"], "suggestions": [],
                                "reaction": "neutral", "reasoning": str(e),
                            }

                        record = {
                            "agent_id": agent.id,
                            "agent_name": agent.name,
                            "round": 1,
                            "timestamp": datetime.now().isoformat(),
                            "demographics": agent.demographics,
                            **resp,
                        }
                        fout.write(json.dumps(record, ensure_ascii=False) + "\n")
                        fout.flush()
                        count += 1
                        SimulationStore.update_status(sim_id, SimStatus.RUNNING, actions_count=count)

                logger.info(f"[{sim_id}] Evaluation complete with {count} responses, starting multi-round social simulation...")

                SimulationStore.update_status(
                    sim_id, SimStatus.RUNNING,
                    actions_count=count, phase="social_simulation",
                    total_rounds=config.get("max_rounds", 8),
                )

                try:
                    all_responses = []
                    with open(resp_path, "r", encoding="utf-8") as fin:
                        for line in fin:
                            line = line.strip()
                            if line:
                                try:
                                    all_responses.append(json.loads(line))
                                except json.JSONDecodeError:
                                    continue
                    self.run_simulation_rounds(sim_id, config, all_responses)
                except Exception as social_exc:
                    logger.warning(f"[{sim_id}] Multi-round social sim failed (non-fatal): {social_exc}")

                SimulationStore.update_status(sim_id, SimStatus.COMPLETED, actions_count=count, progress=100)

            except Exception as exc:
                logger.error(f"[{sim_id}] Simulation run failed: {exc}")
                SimulationStore.update_status(sim_id, SimStatus.FAILED, error=str(exc))

        threading.Thread(target=_bg, daemon=True).start()

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_status(self, sim_id: str) -> dict:
        sim = SimulationStore.get(sim_id)
        if not sim:
            return {"error": "not found"}

        base = sim.to_dict()
        responses = self._load_responses(sim_id)
        n = len(responses)
        pop = sim.population_count or 1

        if n > 0:
            interests = [r.get("interest", 5) for r in responses]
            avg_interest = sum(interests) / n
            viability = min(100, max(0, int(avg_interest * 10)))
            base["stats"] = {
                "viability": viability,
                "avg_interest": int(avg_interest * 10),
                "responses": n,
            }
            base["progress"] = min(100, int(n / pop * 100))
            base["reactions"] = [
                {
                    "id": r.get("agent_id", ""),
                    "agent": r.get("agent_name", ""),
                    "sentiment": r.get("reaction", "neutral"),
                    "comment": r.get("reasoning", "")[:120],
                }
                for r in responses
            ]
        else:
            base["stats"] = {"viability": 0, "avg_interest": 0, "responses": 0}
            base["progress"] = 0

        idea = sim.config.get("idea", sim.config.get("business_idea", ""))
        if idea:
            base["idea_summary"] = idea[:200]

        return base

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    def get_actions(self, sim_id: str, from_line: int = 0) -> list[Action]:
        data_dir = SimulationStore.get_data_dir(sim_id)
        resp_path = os.path.join(data_dir, "responses.jsonl")
        if not os.path.exists(resp_path):
            return []

        actions: list[Action] = []
        with open(resp_path, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                if i < from_line:
                    continue
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                actions.append(Action(
                    round=rec.get("round", 1),
                    agent_id=rec.get("agent_id", ""),
                    agent_name=rec.get("agent_name", ""),
                    action_type="evaluate",
                    content=rec.get("reasoning", ""),
                    metadata={
                        "interest": rec.get("interest"),
                        "willingness_to_pay": rec.get("willingness_to_pay"),
                        "reaction": rec.get("reaction"),
                        "concerns": rec.get("concerns", []),
                        "suggestions": rec.get("suggestions", []),
                    },
                    timestamp=rec.get("timestamp", ""),
                ))
        return actions

    # ------------------------------------------------------------------
    # Viz data
    # ------------------------------------------------------------------

    def get_viz_data(self, sim_id: str, viz_type: str) -> dict:
        responses = self._load_responses(sim_id)
        population = self._load_population(sim_id)

        if viz_type in ("demographic_network", "network"):
            return self._viz_demographic_network(population, responses)
        elif viz_type == "heatmap":
            return self._viz_heatmap(responses)
        elif viz_type == "radar":
            return self._viz_radar(responses)
        else:
            return {"error": f"Unsupported viz_type: {viz_type}", "supported": ["demographic_network", "heatmap", "radar"]}

    def _viz_demographic_network(self, population: list[dict], responses: list[dict]) -> dict:
        resp_map = {r["agent_id"]: r for r in responses}
        nodes = []
        for agent in population:
            aid = agent.get("id", "")
            resp = resp_map.get(aid, {})
            nodes.append({
                "id": aid,
                "name": agent.get("name", ""),
                "age": agent.get("demographics", {}).get("age"),
                "income_level": agent.get("demographics", {}).get("income_level"),
                "occupation": agent.get("demographics", {}).get("occupation"),
                "interest": resp.get("interest", 0),
                "reaction": resp.get("reaction", "unknown"),
            })

        edges = []
        for i, a in enumerate(population):
            for j, b in enumerate(population):
                if j <= i:
                    continue
                shared = _shared_demographics(a, b)
                if shared:
                    edges.append({
                        "source": a.get("id", ""),
                        "target": b.get("id", ""),
                        "shared": shared,
                    })

        return {"type": "demographic_network", "nodes": nodes, "edges": edges}

    def _viz_heatmap(self, responses: list[dict]) -> dict:
        age_buckets = {"18-25": 0, "26-35": 1, "36-50": 2, "51-65": 3, "65+": 4}
        income_buckets = {"low": 0, "medium": 1, "high": 2}

        grid: dict[str, dict[str, list[int]]] = {}
        for ab in age_buckets:
            grid[ab] = {}
            for ib in income_buckets:
                grid[ab][ib] = []

        for r in responses:
            age = r.get("demographics", {}).get("age", 30)
            income = r.get("demographics", {}).get("income_level", "medium")
            age_key = _age_to_bucket(age)
            if age_key in grid and income in grid[age_key]:
                grid[age_key][income].append(r.get("interest", 5))

        cells = []
        for ab in age_buckets:
            for ib in income_buckets:
                vals = grid[ab][ib]
                avg = sum(vals) / len(vals) if vals else 0
                cells.append({"age_group": ab, "income_level": ib, "avg_interest": round(avg, 2), "count": len(vals)})

        return {"type": "heatmap", "x_axis": "income_level", "y_axis": "age_group", "cells": cells}

    def _viz_radar(self, responses: list[dict]) -> dict:
        if not responses:
            return {"type": "radar", "dimensions": [], "values": []}

        total_interest = 0
        reaction_counts = defaultdict(int)
        concern_count = 0
        suggestion_count = 0
        wtp_values = []

        for r in responses:
            total_interest += r.get("interest", 5)
            reaction_counts[r.get("reaction", "neutral")] += 1
            concern_count += len(r.get("concerns", []))
            suggestion_count += len(r.get("suggestions", []))
            wtp = r.get("willingness_to_pay", 0)
            if isinstance(wtp, (int, float)):
                wtp_values.append(wtp)

        n = len(responses)
        dimensions = ["avg_interest", "pct_interested", "pct_skeptical", "avg_concerns", "avg_suggestions"]
        values = [
            round(total_interest / n, 2),
            round(reaction_counts.get("interested", 0) / n * 10, 2),
            round(reaction_counts.get("skeptical", 0) / n * 10, 2),
            round(concern_count / n, 2),
            round(suggestion_count / n, 2),
        ]

        return {"type": "radar", "dimensions": dimensions, "values": values}

    # ------------------------------------------------------------------
    # Stop
    # ------------------------------------------------------------------

    def stop(self, sim_id: str) -> None:
        _stop_flags[sim_id] = True
        SimulationStore.update_status(sim_id, SimStatus.STOPPED)

    # ------------------------------------------------------------------
    # Report
    # ------------------------------------------------------------------

    def generate_report(self, sim_id: str) -> dict:
        responses = self._load_responses(sim_id)
        if not responses:
            return {"error": "No responses to aggregate"}

        n = len(responses)
        interests = [r.get("interest", 5) for r in responses]
        avg_interest = sum(interests) / n

        reaction_counts = defaultdict(int)
        all_concerns: list[str] = []
        all_suggestions: list[str] = []
        wtp_values: list[float] = []
        demo_breakdown: dict[str, dict] = defaultdict(lambda: {"count": 0, "avg_interest": 0, "total": 0})

        for r in responses:
            reaction_counts[r.get("reaction", "neutral")] += 1
            all_concerns.extend(r.get("concerns", []))
            all_suggestions.extend(r.get("suggestions", []))
            wtp = r.get("willingness_to_pay", 0)
            if isinstance(wtp, (int, float)):
                wtp_values.append(float(wtp))
            income = r.get("demographics", {}).get("income_level", "unknown")
            demo_breakdown[income]["count"] += 1
            demo_breakdown[income]["total"] += r.get("interest", 5)

        for k, v in demo_breakdown.items():
            v["avg_interest"] = round(v["total"] / v["count"], 2) if v["count"] else 0

        concern_freq = defaultdict(int)
        for c in all_concerns:
            concern_freq[c.lower().strip()] += 1
        top_concerns = sorted(concern_freq.items(), key=lambda x: -x[1])[:10]

        viability_score = min(100, max(0, int(avg_interest * 10)))
        strengths = [s for s in all_suggestions if s] [:10]

        report = {
            "sim_id": sim_id,
            "total_respondents": n,
            "viability_score": viability_score,
            "avg_interest": round(avg_interest, 2),
            "reaction_distribution": dict(reaction_counts),
            "demographic_breakdown": {k: {"count": v["count"], "avg_interest": v["avg_interest"]} for k, v in demo_breakdown.items()},
            "concern_clusters": [{"concern": c, "frequency": f} for c, f in top_concerns],
            "strengths": strengths,
            "price_sensitivity": {
                "avg_wtp": round(sum(wtp_values) / len(wtp_values), 2) if wtp_values else None,
                "min_wtp": min(wtp_values) if wtp_values else None,
                "max_wtp": max(wtp_values) if wtp_values else None,
            },
            "generated_at": datetime.now().isoformat(),
        }

        try:
            summary_resp = self.llm.chat(messages=[
                {"role": "system", "content": "You are a market research analyst. Write a concise executive summary and actionable recommendations based on simulation results."},
                {"role": "user", "content": (
                    f"Simulation results for a business idea evaluation:\n"
                    f"- Total respondents: {n}\n"
                    f"- Viability score: {viability_score}/100\n"
                    f"- Average interest: {round(avg_interest, 2)}/10\n"
                    f"- Reaction distribution: {dict(reaction_counts)}\n"
                    f"- Top concerns: {[c for c, _ in top_concerns[:5]]}\n"
                    f"- Price sensitivity: avg WTP=${report['price_sensitivity']['avg_wtp']}\n\n"
                    "Write:\n1. An executive summary (2-3 paragraphs)\n2. 5 actionable recommendations"
                )},
            ], temperature=0.5, max_tokens=1500)
            report["executive_summary"] = summary_resp
        except Exception:
            report["executive_summary"] = "Executive summary generation failed."

        data_dir = SimulationStore.get_data_dir(sim_id)
        with open(os.path.join(data_dir, "report.json"), "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        SimulationStore.update_status(sim_id, SimStatus.COMPLETED, report_id=sim_id)
        return report

    # ------------------------------------------------------------------
    # Chat
    # ------------------------------------------------------------------

    def chat(self, sim_id: str, message: str, history: list) -> str:
        data_dir = SimulationStore.get_data_dir(sim_id)
        report_path = os.path.join(data_dir, "report.json")

        report_context = ""
        if os.path.exists(report_path):
            with open(report_path, "r", encoding="utf-8") as f:
                report_context = f.read()

        sim = SimulationStore.get(sim_id)
        idea = sim.config.get("idea", sim.config.get("business_idea", sim.config.get("prompt", ""))) if sim else ""

        messages = [
            {"role": "system", "content": (
                "You are a market research analyst assistant. The user ran a simulation "
                "evaluating a business idea with diverse consumer personas. Use the report "
                "data to answer questions insightfully.\n\n"
                f"Business idea: {idea}\n\n"
                f"Report data:\n{report_context}"
            )},
        ]
        for h in history:
            messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
        messages.append({"role": "user", "content": message})

        return self.llm.chat(messages=messages, temperature=0.5, max_tokens=2048)

    # ------------------------------------------------------------------
    # Population retrieval
    # ------------------------------------------------------------------

    def get_population(self, sim_id: str, config: dict) -> list[AgentPersona]:
        population_raw = self._load_population(sim_id)
        return [_dict_to_persona(a) for a in population_raw]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_responses(self, sim_id: str) -> list[dict]:
        data_dir = SimulationStore.get_data_dir(sim_id)
        path = os.path.join(data_dir, "responses.jsonl")
        if not os.path.exists(path):
            return []
        results = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        results.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        return results

    def _load_population(self, sim_id: str) -> list[dict]:
        data_dir = SimulationStore.get_data_dir(sim_id)
        path = os.path.join(data_dir, "population.json")
        if not os.path.exists(path):
            return []
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)


# ======================================================================
# Module-level helpers
# ======================================================================

def _persona_to_dict(p: AgentPersona) -> dict:
    return {
        "id": p.id, "name": p.name, "role": p.role,
        "demographics": p.demographics, "personality": p.personality,
        "portrait_url": p.portrait_url, "metadata": p.metadata,
    }


def _dict_to_persona(d: dict) -> AgentPersona:
    return AgentPersona(
        id=d.get("id", ""),
        name=d.get("name", ""),
        role=d.get("role", ""),
        demographics=d.get("demographics", {}),
        personality=d.get("personality", {}),
        portrait_url=d.get("portrait_url", ""),
        metadata=d.get("metadata", {}),
    )


def _age_to_bucket(age: int) -> str:
    if age <= 25:
        return "18-25"
    elif age <= 35:
        return "26-35"
    elif age <= 50:
        return "36-50"
    elif age <= 65:
        return "51-65"
    return "65+"


def _shared_demographics(a: dict, b: dict) -> list[str]:
    shared = []
    ad = a.get("demographics", {})
    bd = b.get("demographics", {})
    if ad.get("income_level") and ad.get("income_level") == bd.get("income_level"):
        shared.append("income_level")
    if ad.get("occupation") and ad.get("occupation") == bd.get("occupation"):
        shared.append("occupation")
    if _age_to_bucket(ad.get("age", 0)) == _age_to_bucket(bd.get("age", 0)):
        shared.append("age_group")
    return shared
