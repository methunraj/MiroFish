"""
Product launch simulation engine.
Multi-phase simulation: Awareness -> Trial -> Adoption -> Churn
with consumers, competitors, media, and investors.
"""

import os
import json
import threading
import uuid
from datetime import datetime
from typing import List
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

logger = get_logger("parallelworld.engines.product_launch")

_stop_flags: dict[str, bool] = {}

LAUNCH_PHASES = ["awareness", "trial", "adoption", "churn"]

AGENT_TYPES = {
    "early_adopter": "Consumer who eagerly tries new products and influences others",
    "mainstream": "Average consumer who adopts after social proof",
    "laggard": "Conservative consumer resistant to change",
    "competitor": "Competing company that may react to the launch",
    "media": "Journalist or influencer covering the industry",
    "investor": "Financial stakeholder evaluating market opportunity",
}


class ProductLaunchEngine(SocialSimulationMixin, SimulationEngine):
    """Multi-phase product launch simulation."""

    def __init__(self):
        self.llm = LLMClient()

    # ------------------------------------------------------------------
    # Batched population generation
    # ------------------------------------------------------------------

    def _batched_generate_population(self, product: str, pop_size: int) -> list[dict]:
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
                    "You are a market simulation researcher. Generate diverse agents "
                    "for a product launch simulation. Return valid JSON with key "
                    '"agents" containing a list of persona objects.'
                )},
                {"role": "user", "content": (
                    f"Product: {product}\n\n"
                    f"Generate exactly {needed} agents across these types:\n"
                    "- early_adopter (~25%): tech-forward, trend-seeking consumers\n"
                    "- mainstream (~35%): average consumers needing social proof\n"
                    "- laggard (~15%): change-resistant consumers\n"
                    "- competitor (~10%): competing companies in the space\n"
                    "- media (~10%): journalists, bloggers, influencers\n"
                    f"- investor (~5%): VCs, analysts, financial stakeholders\n{avoid_text}\n"
                    "Each persona needs:\n"
                    '- "name": full name or company name\n'
                    '- "agent_type": one of the types above\n'
                    '- "age": integer (for people) or years_established (for companies)\n'
                    '- "income_level": low/medium/high\n'
                    '- "tech_savviness": 1-10\n'
                    '- "brand_loyalty": 1-10 (loyalty to existing solutions)\n'
                    '- "influence_reach": 1-10 (social influence)\n'
                    '- "segment": specific market segment\n'
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
                logger.info(f"Product batch {retry+1}: got {len(batch)}, total {len(all_agents)}/{pop_size}")
            except Exception as exc:
                logger.warning(f"Product batch retry {retry}: {exc}")

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
                product = config.get("product_description", config.get("prompt", ""))
                pop_size = config.get("population_size", 24)

                agents_raw = self._batched_generate_population(product, pop_size)

                personas: list[AgentPersona] = []
                for i, a in enumerate(agents_raw):
                    pid = f"pl_{uuid.uuid4().hex[:8]}"
                    atype = a.get("agent_type", "mainstream")
                    personas.append(AgentPersona(
                        id=pid,
                        name=a.get("name", f"Agent_{i}"),
                        role=atype,
                        demographics={
                            "age": a.get("age"),
                            "income_level": a.get("income_level"),
                            "segment": a.get("segment"),
                            "agent_type": atype,
                        },
                        personality={
                            "tech_savviness": a.get("tech_savviness", 5),
                            "brand_loyalty": a.get("brand_loyalty", 5),
                            "influence_reach": a.get("influence_reach", 5),
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
                                id=sim_id, mode="product",
                                name=config.get("name", "Product Launch"),
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

                SimulationStore.update_status(sim_id, SimStatus.PENDING, population_count=len(personas))
                logger.info(f"[{sim_id}] Generated {len(personas)} product launch agents")

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
        if not population:
            population = _load_population_personas(data_dir)

        product = config.get("product_description", config.get("prompt", ""))
        config.setdefault("total_simulation_hours", 4)
        config.setdefault("max_rounds", 8)
        config.setdefault("minutes_per_round", 30)
        SimulationStore.update_status(sim_id, SimStatus.RUNNING)
        _stop_flags[sim_id] = False

        def _bg():
            resp_path = os.path.join(data_dir, "responses.jsonl")
            count = 0
            phase_state: dict[str, dict] = {}

            try:
                with open(resp_path, "w", encoding="utf-8") as fout:
                    for phase_idx, phase in enumerate(LAUNCH_PHASES):
                        if _stop_flags.get(sim_id):
                            SimulationStore.update_status(sim_id, SimStatus.STOPPED)
                            return

                        phase_summary = _summarize_phase_state(phase_state) if phase_state else ""

                        for agent in population:
                            if _stop_flags.get(sim_id):
                                SimulationStore.update_status(sim_id, SimStatus.STOPPED)
                                return

                            persona_desc = _describe_agent(agent)
                            prior = phase_state.get(agent.id, {})
                            prior_text = ""
                            if prior:
                                prior_text = (
                                    f"\nYour status from the previous phase ({prior.get('phase')}):\n"
                                    f"Decision: {prior.get('decision')}, Sentiment: {prior.get('sentiment')}\n"
                                )

                            prompt_by_type = _get_phase_prompt(phase, agent.role, product, phase_summary)

                            messages = [
                                {"role": "system", "content": (
                                    "You are role-playing as a specific agent in a product launch "
                                    "simulation. Respond with valid JSON only."
                                )},
                                {"role": "user", "content": (
                                    f"Your persona:\n{persona_desc}\n{prior_text}\n"
                                    f"Phase: {phase} (phase {phase_idx + 1}/{len(LAUNCH_PHASES)})\n\n"
                                    f"{prompt_by_type}\n\n"
                                    "Respond with JSON:\n"
                                    '- "decision": your action/decision this phase\n'
                                    '- "sentiment": positive/neutral/negative\n'
                                    '- "interest_level": 1-10\n'
                                    '- "reasoning": brief explanation\n'
                                    '- "influence_action": what you tell others (if anything)\n'
                                    '- "would_recommend": true/false'
                                )},
                            ]

                            try:
                                resp = self.llm.chat_json(messages=messages, temperature=0.6, max_tokens=1024)
                            except Exception as e:
                                logger.warning(f"[{sim_id}] Agent {agent.id} phase {phase} error: {e}")
                                resp = {
                                    "decision": "no_action", "sentiment": "neutral",
                                    "interest_level": 5, "reasoning": str(e),
                                    "influence_action": "", "would_recommend": False,
                                }

                            phase_state[agent.id] = {**resp, "phase": phase}

                            record = {
                                "agent_id": agent.id,
                                "agent_name": agent.name,
                                "agent_type": agent.role,
                                "round": phase_idx + 1,
                                "phase": phase,
                                "timestamp": datetime.now().isoformat(),
                                "demographics": agent.demographics,
                                **resp,
                            }
                            fout.write(json.dumps(record, ensure_ascii=False) + "\n")
                            fout.flush()
                            count += 1
                            SimulationStore.update_status(sim_id, SimStatus.RUNNING, actions_count=count)

                logger.info(f"[{sim_id}] Product launch phases complete: {count} actions, starting multi-round social simulation...")

                SimulationStore.update_status(
                    sim_id, SimStatus.RUNNING,
                    actions_count=count, phase="social_simulation",
                    total_rounds=config.get("max_rounds", 8),
                )

                try:
                    all_responses = _load_responses(sim_id)
                    self.run_simulation_rounds(sim_id, config, all_responses)
                except Exception as social_exc:
                    logger.warning(f"[{sim_id}] Multi-round social sim failed (non-fatal): {social_exc}")

                SimulationStore.update_status(sim_id, SimStatus.COMPLETED, actions_count=count, progress=100)

            except Exception as exc:
                logger.error(f"[{sim_id}] Product launch sim failed: {exc}")
                SimulationStore.update_status(sim_id, SimStatus.FAILED, error=str(exc))

        threading.Thread(target=_bg, daemon=True).start()

    # ------------------------------------------------------------------
    # Status / Actions
    # ------------------------------------------------------------------

    def get_status(self, sim_id: str) -> dict:
        sim = SimulationStore.get(sim_id)
        if not sim:
            return {"error": "not found"}

        base = sim.to_dict()
        actions = _read_actions_jsonl(sim_id, 0, action_type="product_launch_action")
        n = len(actions)
        pop = sim.population_count or 1

        adoption_count = sum(1 for a in actions if "adopt" in a.content.lower())
        total_interest = sum(a.metadata.get("rating", 5) for a in actions) if actions else 0

        base["stats"] = {
            "adoption_rate": min(100, int(adoption_count / max(n, 1) * 100)),
            "avg_rating": int(total_interest / max(n, 1) * 10),
            "word_of_mouth": min(100, n * 3),
            "responses": n,
        }
        base["progress"] = min(100, int(n / pop * 100)) if pop > 0 else 0
        base["round"] = max((a.round for a in actions), default=0)
        base["total_rounds"] = sim.config.get("total_rounds", 4)

        return base

    def get_actions(self, sim_id: str, from_line: int = 0) -> list[Action]:
        return _read_actions_jsonl(sim_id, from_line, action_type="product_launch_action")

    # ------------------------------------------------------------------
    # Viz data
    # ------------------------------------------------------------------

    def get_viz_data(self, sim_id: str, viz_type: str) -> dict:
        responses = _load_responses(sim_id)

        if viz_type == "sankey":
            return self._viz_sankey(responses)
        elif viz_type == "timeline":
            return self._viz_timeline(responses)
        elif viz_type == "radar":
            return self._viz_radar(responses)
        elif viz_type == "heatmap":
            return self._viz_heatmap(responses)
        elif viz_type in ("network", "demographic_network", "adoption_network"):
            return self._viz_network(sim_id, responses)
        return {"error": f"Unsupported viz_type: {viz_type}",
                "supported": ["sankey", "timeline", "radar", "heatmap", "network", "demographic_network"]}

    def _viz_network(self, sim_id: str, responses: list[dict]) -> dict:
        """Build demographic network from population + response data."""
        sim = SimulationStore.get(sim_id)
        config = sim.config if sim else {}
        population = self.get_population(sim_id, config)
        resp_map = {r.get("agent_id", ""): r for r in responses}
        nodes = []
        for p in population:
            aid = p.id
            r = resp_map.get(aid, {})
            demos = p.demographics or {}
            nodes.append({
                "id": aid,
                "name": p.name,
                "activity": r.get("rating", 5) / 10 if r else 0.5,
                "group": demos.get("income_level", p.role or "unknown"),
            })

        edges = []
        for i, a in enumerate(population):
            for b in population[i + 1:]:
                shared = []
                da = a.demographics or {}
                db = b.demographics or {}
                for key in ("age_group", "income_level", "occupation"):
                    if da.get(key) and da.get(key) == db.get(key):
                        shared.append(key)
                if shared:
                    edges.append({
                        "source": a.id,
                        "target": b.id,
                        "shared": shared,
                        "weight": len(shared),
                        "type": shared[0],
                    })
        return {"nodes": nodes, "edges": edges}

    def _viz_sankey(self, responses: list[dict]) -> dict:
        """Adoption funnel: phase-to-phase sentiment transitions."""
        transitions: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        agent_phases: dict[str, list[dict]] = defaultdict(list)

        for r in responses:
            agent_phases[r.get("agent_id", "")].append(r)

        for aid, phases in agent_phases.items():
            phases.sort(key=lambda x: x.get("round", 0))
            for i in range(1, len(phases)):
                src = f"{phases[i-1].get('phase', '?')}:{phases[i-1].get('sentiment', '?')}"
                tgt = f"{phases[i].get('phase', '?')}:{phases[i].get('sentiment', '?')}"
                transitions[src][tgt] += 1

        links = []
        for src, tgts in transitions.items():
            for tgt, val in tgts.items():
                links.append({"source": src, "target": tgt, "value": val})

        return {"type": "sankey", "links": links}

    def _viz_timeline(self, responses: list[dict]) -> dict:
        events: list[dict] = []
        for phase in LAUNCH_PHASES:
            phase_responses = [r for r in responses if r.get("phase") == phase]
            if not phase_responses:
                continue
            positive = sum(1 for r in phase_responses if r.get("sentiment") == "positive")
            negative = sum(1 for r in phase_responses if r.get("sentiment") == "negative")
            events.append({
                "phase": phase,
                "total_actions": len(phase_responses),
                "positive_sentiment": positive,
                "negative_sentiment": negative,
                "avg_interest": round(sum(r.get("interest_level", 5) for r in phase_responses) / len(phase_responses), 2),
            })
        return {"type": "timeline", "events": events}

    def _viz_radar(self, responses: list[dict]) -> dict:
        type_scores: dict[str, list[int]] = defaultdict(list)
        for r in responses:
            atype = r.get("agent_type", "unknown")
            type_scores[atype].append(r.get("interest_level", 5))

        dimensions = list(type_scores.keys())
        values = [round(sum(v) / len(v), 2) if v else 0 for v in type_scores.values()]
        return {"type": "radar", "dimensions": dimensions, "values": values}

    def _viz_heatmap(self, responses: list[dict]) -> dict:
        cells = []
        groups: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
        for r in responses:
            atype = r.get("agent_type", "unknown")
            phase = r.get("phase", "unknown")
            groups[atype][phase].append(r.get("interest_level", 5))

        for atype, phases in groups.items():
            for phase, vals in phases.items():
                cells.append({
                    "agent_type": atype, "phase": phase,
                    "avg_interest": round(sum(vals) / len(vals), 2),
                    "count": len(vals),
                })
        return {"type": "heatmap", "x_axis": "phase", "y_axis": "agent_type", "cells": cells}

    # ------------------------------------------------------------------
    # Population retrieval
    # ------------------------------------------------------------------

    def get_population(self, sim_id: str, config: dict) -> list[AgentPersona]:
        data_dir = SimulationStore.get_data_dir(sim_id)
        return _load_population_personas(data_dir)

    # Stop / Report / Chat
    # ------------------------------------------------------------------

    def stop(self, sim_id: str) -> None:
        _stop_flags[sim_id] = True
        SimulationStore.update_status(sim_id, SimStatus.STOPPED)

    def generate_report(self, sim_id: str) -> dict:
        responses = _load_responses(sim_id)
        if not responses:
            return {"error": "No responses to aggregate"}

        phase_data = {}
        for phase in LAUNCH_PHASES:
            pr = [r for r in responses if r.get("phase") == phase]
            if pr:
                phase_data[phase] = {
                    "respondents": len(pr),
                    "avg_interest": round(sum(r.get("interest_level", 5) for r in pr) / len(pr), 2),
                    "recommendation_rate": round(sum(1 for r in pr if r.get("would_recommend")) / len(pr) * 100, 1),
                    "sentiment_distribution": {
                        s: sum(1 for r in pr if r.get("sentiment") == s)
                        for s in ["positive", "neutral", "negative"]
                    },
                }

        report = {
            "sim_id": sim_id,
            "total_actions": len(responses),
            "phases": phase_data,
            "adoption_funnel": {
                phase: sum(1 for r in responses if r.get("phase") == phase and r.get("sentiment") == "positive")
                for phase in LAUNCH_PHASES
            },
            "generated_at": datetime.now().isoformat(),
        }

        try:
            funnel_str = ", ".join(f"{k}: {v}" for k, v in report["adoption_funnel"].items())
            summary_resp = self.llm.chat(messages=[
                {"role": "system", "content": "You are a product launch analyst. Write a concise executive summary and recommendations."},
                {"role": "user", "content": (
                    f"Product launch simulation results:\n"
                    f"- Total actions across phases: {len(responses)}\n"
                    f"- Adoption funnel: {funnel_str}\n"
                    f"- Phase data: {json.dumps(phase_data, default=str)}\n\n"
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

    def chat(self, sim_id: str, message: str, history: list) -> str:
        report_context = _load_report_context(sim_id)
        sim = SimulationStore.get(sim_id)
        product = sim.config.get("product_description", sim.config.get("prompt", "")) if sim else ""

        messages = [
            {"role": "system", "content": (
                "You are a product launch analyst. The user ran a multi-phase product "
                "launch simulation. Use the report data to answer questions.\n\n"
                f"Product: {product}\n\nReport:\n{report_context}"
            )},
        ]
        for h in history:
            messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
        messages.append({"role": "user", "content": message})
        return self.llm.chat(messages=messages, temperature=0.5, max_tokens=2048)


# ======================================================================
# Helpers
# ======================================================================

def _persona_to_dict(p: AgentPersona) -> dict:
    return {
        "id": p.id, "name": p.name, "role": p.role,
        "demographics": p.demographics, "personality": p.personality,
        "portrait_url": p.portrait_url, "metadata": p.metadata,
    }


def _dict_to_persona(d: dict) -> AgentPersona:
    return AgentPersona(
        id=d.get("id", ""), name=d.get("name", ""), role=d.get("role", ""),
        demographics=d.get("demographics", {}), personality=d.get("personality", {}),
        portrait_url=d.get("portrait_url", ""), metadata=d.get("metadata", {}),
    )


def _load_population_personas(data_dir: str) -> list[AgentPersona]:
    path = os.path.join(data_dir, "population.json")
    if not os.path.exists(path):
        raise ValueError("Population not generated yet")
    with open(path, "r", encoding="utf-8") as f:
        return [_dict_to_persona(a) for a in json.load(f)]


def _load_responses(sim_id: str) -> list[dict]:
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


def _read_actions_jsonl(sim_id: str, from_line: int, action_type: str) -> list[Action]:
    data_dir = SimulationStore.get_data_dir(sim_id)
    path = os.path.join(data_dir, "responses.jsonl")
    if not os.path.exists(path):
        return []
    actions: list[Action] = []
    with open(path, "r", encoding="utf-8") as f:
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
                action_type=action_type,
                content=rec.get("reasoning", ""),
                metadata={k: v for k, v in rec.items() if k not in ("agent_id", "agent_name", "round", "timestamp", "reasoning")},
                timestamp=rec.get("timestamp", ""),
            ))
    return actions


def _load_report_context(sim_id: str) -> str:
    data_dir = SimulationStore.get_data_dir(sim_id)
    path = os.path.join(data_dir, "report.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def _describe_agent(agent: AgentPersona) -> str:
    d = agent.demographics
    p = agent.personality
    return (
        f"Name: {agent.name}, Type: {agent.role}, Age: {d.get('age')}, "
        f"Income: {d.get('income_level')}, Segment: {d.get('segment')}, "
        f"Tech savviness: {p.get('tech_savviness')}/10, "
        f"Brand loyalty: {p.get('brand_loyalty')}/10, "
        f"Influence reach: {p.get('influence_reach')}/10, "
        f"Bio: {agent.metadata.get('bio', '')}"
    )


def _get_phase_prompt(phase: str, agent_type: str, product: str, phase_summary: str) -> str:
    context = f"Market context from previous phases:\n{phase_summary}\n\n" if phase_summary else ""

    prompts = {
        "awareness": (
            f"{context}Product being launched: {product}\n\n"
            f"As a {agent_type}, you just learned about this product. "
            "How do you react to hearing about it for the first time?"
        ),
        "trial": (
            f"{context}Product: {product}\n\n"
            f"As a {agent_type}, you now have the opportunity to try/evaluate this product. "
            "Would you try it? What's your initial experience assessment?"
        ),
        "adoption": (
            f"{context}Product: {product}\n\n"
            f"As a {agent_type}, after the trial period, would you adopt this product "
            "long-term? Would you pay for it? Would you recommend it?"
        ),
        "churn": (
            f"{context}Product: {product}\n\n"
            f"As a {agent_type}, after using the product for a while, are you still "
            "satisfied? Would you continue using it or switch to alternatives?"
        ),
    }
    return prompts.get(phase, f"Evaluate the product: {product}")


def _summarize_phase_state(phase_state: dict[str, dict]) -> str:
    if not phase_state:
        return ""
    sentiments = defaultdict(int)
    for ps in phase_state.values():
        sentiments[ps.get("sentiment", "neutral")] += 1
    total = sum(sentiments.values())
    parts = [f"{s}: {c}/{total}" for s, c in sentiments.items()]
    return f"Overall market sentiment: {', '.join(parts)}"
