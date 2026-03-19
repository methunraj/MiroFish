"""
Economy simulation engine.
Multi-round economic cycles: pricing, purchasing, interest rates, regulation.
Agents: companies, consumers, banks, regulators, investors.
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

logger = get_logger("parallelworld.engines.economy")

_stop_flags: dict[str, bool] = {}

ECONOMIC_PHASES = ["pricing_production", "consumer_purchasing", "banking_finance", "regulation_policy"]


class EconomySimEngine(SocialSimulationMixin, SimulationEngine):
    """Multi-round economic cycle simulation."""

    def __init__(self):
        self.llm = LLMClient()

    # ------------------------------------------------------------------
    # Batched population generation
    # ------------------------------------------------------------------

    def _batched_generate_population(self, scenario: str, pop_size: int) -> list[dict]:
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
                    "You are an economist. Generate diverse economic agents "
                    "for a market simulation. Return valid JSON with key "
                    '"agents" containing a list of persona objects.'
                )},
                {"role": "user", "content": (
                    f"Economic scenario: {scenario}\n\n"
                    f"Generate exactly {needed} agents across these types:\n"
                    "- company (~30%): businesses in various industries, different sizes\n"
                    "- consumer (~30%): individuals with different income/spending patterns\n"
                    "- bank (~15%): commercial and investment banks\n"
                    "- regulator (~10%): government agencies, central bank officials\n"
                    f"- investor (~15%): VCs, hedge funds, retail investors\n{avoid_text}\n"
                    "Each persona needs:\n"
                    '- "name": name or company name\n'
                    '- "agent_type": company/consumer/bank/regulator/investor\n'
                    '- "industry": relevant sector\n'
                    '- "size": small/medium/large (for companies/banks)\n'
                    '- "capital": estimated capital in millions USD\n'
                    '- "risk_tolerance": 1-10\n'
                    '- "market_outlook": bullish/neutral/bearish\n'
                    '- "income_level": low/medium/high (for consumers)\n'
                    '- "spending_behavior": conservative/moderate/aggressive\n'
                    '- "region": geographic market\n'
                    '- "bio": one-sentence description\n'
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
                logger.info(f"Economy batch {retry+1}: got {len(batch)}, total {len(all_agents)}/{pop_size}")
            except Exception as exc:
                logger.warning(f"Economy batch retry {retry}: {exc}")

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
                scenario = config.get("scenario_description", config.get("economic_scenario", config.get("prompt", "")))
                pop_size = config.get("population_size", 25)

                agents_raw = self._batched_generate_population(scenario, pop_size)

                personas: list[AgentPersona] = []
                for i, a in enumerate(agents_raw):
                    pid = f"ec_{uuid.uuid4().hex[:8]}"
                    atype = a.get("agent_type", "consumer")
                    personas.append(AgentPersona(
                        id=pid,
                        name=a.get("name", f"Agent_{i}"),
                        role=atype,
                        demographics={
                            "agent_type": atype,
                            "industry": a.get("industry"),
                            "size": a.get("size"),
                            "capital": a.get("capital"),
                            "region": a.get("region"),
                            "income_level": a.get("income_level"),
                        },
                        personality={
                            "risk_tolerance": a.get("risk_tolerance", 5),
                            "market_outlook": a.get("market_outlook", "neutral"),
                            "spending_behavior": a.get("spending_behavior", "moderate"),
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
                                id=sim_id, mode="economy",
                                name=config.get("name", "Economic Simulation"),
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
                logger.info(f"[{sim_id}] Generated {len(personas)} economy agents")

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

        scenario = config.get("scenario_description", config.get("economic_scenario", config.get("prompt", "")))
        config.setdefault("total_simulation_hours", 4)
        config.setdefault("max_rounds", 8)
        config.setdefault("minutes_per_round", 30)
        max_cycles = config.get("time_horizon", config.get("max_rounds", 3))
        SimulationStore.update_status(sim_id, SimStatus.RUNNING)
        _stop_flags[sim_id] = False

        def _bg():
            resp_path = os.path.join(data_dir, "responses.jsonl")
            count = 0
            market_state: dict[str, dict] = {}
            macro_indicators = {
                "gdp_growth": 2.0,
                "inflation": 3.0,
                "unemployment": 5.0,
                "interest_rate": 4.5,
                "consumer_confidence": 60,
            }

            try:
                with open(resp_path, "w", encoding="utf-8") as fout:
                    for cycle in range(1, max_cycles + 1):
                        if _stop_flags.get(sim_id):
                            SimulationStore.update_status(sim_id, SimStatus.STOPPED)
                            return

                        for phase in ECONOMIC_PHASES:
                            if _stop_flags.get(sim_id):
                                SimulationStore.update_status(sim_id, SimStatus.STOPPED)
                                return

                            relevant_agents = _get_phase_agents(population, phase)
                            market_summary = _build_market_summary(market_state, macro_indicators)

                            for agent in relevant_agents:
                                if _stop_flags.get(sim_id):
                                    SimulationStore.update_status(sim_id, SimStatus.STOPPED)
                                    return

                                persona_desc = _describe_agent(agent)
                                prior = market_state.get(agent.id, {})
                                prior_text = ""
                                if prior:
                                    prior_text = (
                                        f"\nYour previous action: {prior.get('action', 'none')}\n"
                                        f"Result: {prior.get('outcome', 'unknown')}\n"
                                    )

                                phase_prompt = _get_economy_phase_prompt(phase, agent.role, scenario)
                                schema = _get_economy_response_schema(phase, agent.role)

                                messages = [
                                    {"role": "system", "content": (
                                        "You are role-playing as a specific economic agent. "
                                        "Make realistic economic decisions. Respond with valid JSON only."
                                    )},
                                    {"role": "user", "content": (
                                        f"Your persona:\n{persona_desc}\n{prior_text}\n"
                                        f"Economic scenario: {scenario}\n\n"
                                        f"Cycle {cycle}/{max_cycles}, Phase: {phase}\n"
                                        f"Market conditions:\n{market_summary}\n\n"
                                        f"{phase_prompt}\n\nRespond with JSON:\n{schema}"
                                    )},
                                ]

                                try:
                                    resp = self.llm.chat_json(messages=messages, temperature=0.6, max_tokens=1024)
                                except Exception as e:
                                    logger.warning(f"[{sim_id}] Agent {agent.id} cycle {cycle} error: {e}")
                                    resp = {
                                        "action": "hold", "reasoning": str(e),
                                        "amount": 0, "confidence": 5, "outcome": "error",
                                    }

                                market_state[agent.id] = {**resp, "phase": phase, "cycle": cycle, "agent_type": agent.role}

                                record = {
                                    "agent_id": agent.id,
                                    "agent_name": agent.name,
                                    "agent_type": agent.role,
                                    "round": cycle,
                                    "phase": phase,
                                    "timestamp": datetime.now().isoformat(),
                                    "demographics": agent.demographics,
                                    "macro_indicators": dict(macro_indicators),
                                    **resp,
                                }
                                fout.write(json.dumps(record, ensure_ascii=False) + "\n")
                                fout.flush()
                                count += 1
                                SimulationStore.update_status(sim_id, SimStatus.RUNNING, actions_count=count)

                        macro_indicators = _update_macro_indicators(macro_indicators, market_state)

                logger.info(f"[{sim_id}] Economy cycles complete: {count} actions, starting multi-round social simulation...")

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
                logger.error(f"[{sim_id}] Economy sim failed: {exc}")
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
        actions = _read_actions_jsonl(sim_id, 0, action_type="economic_action")
        n = len(actions)
        pop = sim.population_count or 1

        base["stats"] = {
            "gdp_delta": sum(a.metadata.get("gdp_impact", 0) for a in actions) if actions else 0,
            "unemployment": 5,
            "inflation": 2,
            "transactions": n,
        }
        base["progress"] = min(100, int(n / pop * 100)) if pop > 0 else 0
        base["round"] = max((a.round for a in actions), default=0)
        base["total_rounds"] = sim.config.get("time_horizon", sim.config.get("max_rounds", 3))

        return base

    def get_actions(self, sim_id: str, from_line: int = 0) -> list[Action]:
        return _read_actions_jsonl(sim_id, from_line, action_type="economic_action")

    # ------------------------------------------------------------------
    # Viz data
    # ------------------------------------------------------------------

    def get_viz_data(self, sim_id: str, viz_type: str) -> dict:
        responses = _load_responses(sim_id)

        if viz_type == "sankey":
            return self._viz_sankey(responses)
        elif viz_type == "heatmap":
            return self._viz_heatmap(responses)
        elif viz_type == "timeline":
            return self._viz_timeline(responses)
        elif viz_type in ("network", "demographic_network", "trade_network"):
            return self._viz_network(sim_id, responses)
        return {"error": f"Unsupported viz_type: {viz_type}",
                "supported": ["sankey", "heatmap", "timeline", "network", "demographic_network"]}

    def _viz_network(self, sim_id: str, responses: list[dict]) -> dict:
        """Build trade/agent network from population data."""
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
                "activity": len([x for x in responses if x.get("agent_id") == aid]) / max(1, len(responses)),
                "group": demos.get("sector", demos.get("role", p.role or "unknown")),
            })

        edges = []
        for i, a in enumerate(population):
            for b in population[i + 1:]:
                shared = []
                da = a.demographics or {}
                db = b.demographics or {}
                for key in ("sector", "income_level", "region", "role"):
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
        """Money flows between agent types."""
        flows: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        for r in responses:
            src = r.get("agent_type", "unknown")
            action = r.get("action", "")
            amount = r.get("amount", 0)
            if isinstance(amount, (int, float)) and amount > 0:
                if "invest" in action.lower() or "lend" in action.lower():
                    flows[src]["investment_recipients"] += amount
                elif "buy" in action.lower() or "purchase" in action.lower():
                    flows[src]["sellers"] += amount
                elif "tax" in action.lower() or "regulate" in action.lower():
                    flows[src]["government"] += amount
                else:
                    flows[src]["market"] += amount

        links = []
        for src, tgts in flows.items():
            for tgt, val in tgts.items():
                links.append({"source": src, "target": tgt, "value": round(val, 2)})

        return {"type": "sankey", "links": links}

    def _viz_heatmap(self, responses: list[dict]) -> dict:
        """Market activity by industry and cycle."""
        cells = []
        groups: dict[str, dict[int, list[float]]] = defaultdict(lambda: defaultdict(list))
        for r in responses:
            industry = r.get("demographics", {}).get("industry", "unknown")
            cycle = r.get("round", 1)
            amount = r.get("amount", 0)
            if isinstance(amount, (int, float)):
                groups[industry][cycle].append(amount)

        for industry, cycles in groups.items():
            for cycle, vals in cycles.items():
                cells.append({
                    "industry": industry, "cycle": cycle,
                    "avg_activity": round(sum(vals) / len(vals), 2),
                    "total_volume": round(sum(vals), 2),
                    "count": len(vals),
                })

        return {"type": "heatmap", "x_axis": "cycle", "y_axis": "industry", "cells": cells}

    def _viz_timeline(self, responses: list[dict]) -> dict:
        """Macro indicators over time."""
        cycle_data: dict[int, dict] = {}
        for r in responses:
            cycle = r.get("round", 1)
            indicators = r.get("macro_indicators", {})
            if indicators and cycle not in cycle_data:
                cycle_data[cycle] = indicators

        events = []
        for cycle in sorted(cycle_data.keys()):
            events.append({"cycle": cycle, **cycle_data[cycle]})

        return {"type": "timeline", "events": events}

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

        n = len(responses)
        agent_type_stats: dict[str, dict] = defaultdict(lambda: {"count": 0, "total_amount": 0, "actions": defaultdict(int)})

        for r in responses:
            atype = r.get("agent_type", "unknown")
            agent_type_stats[atype]["count"] += 1
            amount = r.get("amount", 0)
            if isinstance(amount, (int, float)):
                agent_type_stats[atype]["total_amount"] += amount
            action = r.get("action", "unknown")
            agent_type_stats[atype]["actions"][action] += 1

        last_indicators = {}
        for r in reversed(responses):
            if r.get("macro_indicators"):
                last_indicators = r["macro_indicators"]
                break

        report = {
            "sim_id": sim_id,
            "total_interactions": n,
            "final_macro_indicators": last_indicators,
            "agent_type_summary": {
                k: {"count": v["count"], "total_amount": round(v["total_amount"], 2),
                    "top_actions": dict(sorted(v["actions"].items(), key=lambda x: -x[1])[:5])}
                for k, v in agent_type_stats.items()
            },
            "generated_at": datetime.now().isoformat(),
        }

        try:
            indicators_str = ", ".join(f"{k}: {v}" for k, v in last_indicators.items()) if last_indicators else "N/A"
            summary_resp = self.llm.chat(messages=[
                {"role": "system", "content": "You are an economic analyst. Write a concise executive summary and recommendations."},
                {"role": "user", "content": (
                    f"Economic simulation results:\n"
                    f"- Total interactions: {n}\n"
                    f"- Final macro indicators: {indicators_str}\n"
                    f"- Agent types: {list(agent_type_stats.keys())}\n\n"
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
        scenario = sim.config.get("scenario_description", sim.config.get("economic_scenario", sim.config.get("prompt", ""))) if sim else ""

        messages = [
            {"role": "system", "content": (
                "You are an economic analyst. The user ran a multi-cycle economic simulation. "
                "Use the report data to answer questions.\n\n"
                f"Scenario: {scenario}\n\nReport:\n{report_context}"
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
        f"Name: {agent.name}, Type: {agent.role}, "
        f"Industry: {d.get('industry')}, Size: {d.get('size')}, "
        f"Capital: ${d.get('capital', '?')}M, Region: {d.get('region')}, "
        f"Income level: {d.get('income_level')}, "
        f"Risk tolerance: {p.get('risk_tolerance')}/10, "
        f"Market outlook: {p.get('market_outlook')}, "
        f"Spending: {p.get('spending_behavior')}, "
        f"Bio: {agent.metadata.get('bio', '')}"
    )


def _get_phase_agents(population: list[AgentPersona], phase: str) -> list[AgentPersona]:
    """Determine which agent types are active in each phase."""
    phase_roles = {
        "pricing_production": ["company"],
        "consumer_purchasing": ["consumer"],
        "banking_finance": ["bank", "investor"],
        "regulation_policy": ["regulator"],
    }
    active_roles = phase_roles.get(phase, [r for r in ["company", "consumer", "bank", "regulator", "investor"]])
    return [a for a in population if a.role in active_roles]


def _get_economy_phase_prompt(phase: str, agent_type: str, scenario: str) -> str:
    prompts = {
        "pricing_production": (
            f"As a {agent_type}, set your pricing strategy and production levels. "
            "Consider current market conditions, competition, and demand."
        ),
        "consumer_purchasing": (
            f"As a {agent_type}, make your purchasing decisions. "
            "Consider prices, income, savings goals, and market conditions."
        ),
        "banking_finance": (
            f"As a {agent_type}, make your financial decisions. "
            "Consider interest rates, risk, portfolio allocation, and market outlook."
        ),
        "regulation_policy": (
            f"As a {agent_type}, set policy for this economic cycle. "
            "Consider inflation, unemployment, growth, and market stability."
        ),
    }
    return prompts.get(phase, f"Make your economic decision in the context of: {scenario}")


def _get_economy_response_schema(phase: str, agent_type: str) -> str:
    base = (
        '- "action": your primary action this phase\n'
        '- "amount": dollar amount involved (number)\n'
        '- "confidence": 1-10\n'
        '- "reasoning": brief explanation\n'
        '- "outcome": expected outcome of your action\n'
    )

    if agent_type == "company":
        return base + '- "price_change_pct": percentage price change\n' + '- "production_change": increase/decrease/maintain\n'
    elif agent_type == "bank":
        return base + '- "lending_stance": tight/normal/loose\n' + '- "rate_adjustment": number (basis points)\n'
    elif agent_type == "regulator":
        return base + '- "policy_type": monetary/fiscal/regulatory\n' + '- "strictness": 1-10\n'
    elif agent_type == "investor":
        return base + '- "investment_sector": target sector\n' + '- "position": buy/hold/sell\n'
    return base


def _build_market_summary(market_state: dict[str, dict], macro: dict) -> str:
    parts = [f"Macro: GDP growth={macro['gdp_growth']}%, Inflation={macro['inflation']}%, "
             f"Unemployment={macro['unemployment']}%, Interest rate={macro['interest_rate']}%, "
             f"Consumer confidence={macro['consumer_confidence']}"]

    if market_state:
        type_actions = defaultdict(list)
        for ms in market_state.values():
            type_actions[ms.get("agent_type", "")].append(ms.get("action", "unknown"))
        for atype, actions in type_actions.items():
            common = max(set(actions), key=actions.count) if actions else "none"
            parts.append(f"{atype}: most common action = {common} ({len(actions)} agents)")

    return "\n".join(parts)


def _update_macro_indicators(macro: dict, market_state: dict[str, dict]) -> dict:
    """Simple heuristic update of macro indicators based on agent actions."""
    updated = dict(macro)

    company_actions = [v for v in market_state.values() if v.get("agent_type") == "company"]
    if company_actions:
        price_changes = [v.get("price_change_pct", 0) for v in company_actions if isinstance(v.get("price_change_pct"), (int, float))]
        if price_changes:
            avg_price_change = sum(price_changes) / len(price_changes)
            updated["inflation"] = max(0, round(updated["inflation"] + avg_price_change * 0.1, 2))

    regulator_actions = [v for v in market_state.values() if v.get("agent_type") == "regulator"]
    if regulator_actions:
        rate_adjs = [v.get("rate_adjustment", 0) for v in regulator_actions if isinstance(v.get("rate_adjustment"), (int, float))]
        if rate_adjs:
            avg_adj = sum(rate_adjs) / len(rate_adjs)
            updated["interest_rate"] = max(0, round(updated["interest_rate"] + avg_adj / 100, 2))

    consumer_actions = [v for v in market_state.values() if v.get("agent_type") == "consumer"]
    if consumer_actions:
        conf_vals = [v.get("confidence", 5) for v in consumer_actions]
        if conf_vals:
            updated["consumer_confidence"] = round(sum(conf_vals) / len(conf_vals) * 10, 1)

    return updated
