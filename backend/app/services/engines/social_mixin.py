"""
Social simulation mixin -- adds Twitter posting, Reddit discussions,
agent debates, opinion shifts, influence propagation, and emotional modeling
to any simulation engine. All data persists to PostgreSQL.
"""

import json
import os
import uuid
import random
import logging
from datetime import datetime
from typing import List, Dict, Optional, Any
from collections import defaultdict

from ...utils.llm_client import LLMClient
from ...models.graph_db import get_db_session
from ...models.simulation_db import (
    AgentRecord, AgentStateRecord, AgentMemory, SimulationEvent, SimulationRecord
)
from ...models.social_db import (
    SocialPost, PostReaction, DiscussionThread, ThreadComment,
    AgentDebate, DebateTurn, TrendingTopic
)

logger = logging.getLogger("parallelworld.social_mixin")


def _uid() -> str:
    return uuid.uuid4().hex[:12]


def _emit_event(session, sim_id: str, event_type: str, agent_id: str = None,
                agent_name: str = None, agent_portrait: str = None,
                data: dict = None, phase: str = ""):
    """Write a SimulationEvent row (powers the SSE live feed)."""
    ev = SimulationEvent(
        sim_id=sim_id,
        event_type=event_type,
        agent_id=agent_id,
        agent_name=agent_name,
        agent_portrait=agent_portrait,
        data=data or {},
        phase=phase,
    )
    session.add(ev)
    session.flush()


def _store_memory(session, agent_id: str, sim_id: str, content: str,
                  memory_type: str = "social", importance: float = 0.5):
    """Store an event in agent memory."""
    mem = AgentMemory(
        agent_id=agent_id,
        sim_id=sim_id,
        content=content,
        memory_type=memory_type,
        importance=importance,
    )
    session.add(mem)


def _get_latest_state(session, agent_id: str, sim_id: str) -> Optional[AgentStateRecord]:
    """Get the most recent state record for an agent."""
    return (
        session.query(AgentStateRecord)
        .filter_by(agent_id=agent_id, sim_id=sim_id)
        .order_by(AgentStateRecord.created_at.desc())
        .first()
    )


def _build_agent_context(session, agent: AgentRecord, sim_id: str, topic: str) -> str:
    """Build rich LLM context from DB for an agent."""
    lines = []
    lines.append(f"You are {agent.name}, a {agent.role}.")
    if agent.demographics:
        demo = agent.demographics
        lines.append(f"Age: {demo.get('age', '?')}, Occupation: {demo.get('occupation', '?')}, "
                      f"Income: {demo.get('income_level', '?')}")
    if agent.personality:
        p = agent.personality
        lines.append(f"Personality: {p.get('type', p.get('personality_type', '?'))}")
    if agent.bio:
        lines.append(f"Bio: {agent.bio}")

    state = _get_latest_state(session, agent.id, sim_id)
    if state:
        lines.append(f"\nCurrent mood: {state.emotional_state.get('mood', 'neutral')} "
                      f"(intensity: {state.emotional_state.get('intensity', 5)}/10)")
        lines.append(f"Your current stance: sentiment={state.sentiment:.1f}/10")
        if state.faction:
            lines.append(f"You belong to the '{state.faction}' faction.")

    memories = (
        session.query(AgentMemory)
        .filter_by(agent_id=agent.id, sim_id=sim_id)
        .order_by(AgentMemory.importance.desc(), AgentMemory.created_at.desc())
        .limit(8)
        .all()
    )
    if memories:
        lines.append("\nKey things you remember:")
        for m in memories:
            lines.append(f"  - [{m.memory_type}] {m.content}")

    lines.append(f"\nThe topic being discussed: {topic}")
    return "\n".join(lines)


class SocialSimulationMixin:
    """Mixin class providing social simulation phases."""

    def _get_llm(self) -> LLMClient:
        """Engines should override or have self.llm available."""
        if hasattr(self, "llm") and self.llm:
            return self.llm
        return LLMClient()

    def _get_topic(self, sim_id: str, config: dict) -> str:
        """Extract the simulation topic from config."""
        return (config.get("idea") or config.get("business_idea") or
                config.get("product_name") or config.get("scenario_description") or
                config.get("prompt") or "the topic under discussion")

    # ------------------------------------------------------------------
    # Phase: Social Posting (Twitter-like)
    # ------------------------------------------------------------------

    def run_social_posting(self, sim_id: str, config: dict):
        """Each agent creates Twitter-like posts, then others react."""
        llm = self._get_llm()
        topic = self._get_topic(sim_id, config)

        with get_db_session() as session:
            agents = session.query(AgentRecord).filter_by(sim_id=sim_id).all()
            if not agents:
                return

            _emit_event(session, sim_id, "phase_start", data={"phase": "social_posting", "message": "Agents are posting on social media..."}, phase="social")

            posts_created = []

            for agent in agents:
                if random.random() > (agent.activity_level or 0.5) + 0.3:
                    continue

                ctx = _build_agent_context(session, agent, sim_id, topic)
                try:
                    result = llm.chat_json(messages=[
                        {"role": "system", "content": (
                            "You are a social media user posting about a topic. "
                            "Write a short tweet (max 280 chars) expressing your opinion. "
                            "Return JSON: {\"content\": \"...\", \"hashtags\": [\"#tag1\"], \"sentiment\": \"positive|negative|neutral|mixed\"}"
                        )},
                        {"role": "user", "content": ctx},
                    ])
                except Exception as exc:
                    logger.error(f"Social posting failed for {agent.id}: {exc}")
                    continue

                post_id = f"post_{_uid()}"
                post = SocialPost(
                    id=post_id,
                    sim_id=sim_id,
                    agent_id=agent.id,
                    content=result.get("content", "")[:500],
                    hashtags=result.get("hashtags", []),
                    sentiment=result.get("sentiment", "neutral"),
                    post_type="tweet",
                    phase="social",
                )
                session.add(post)

                _emit_event(session, sim_id, "post", agent.id, agent.name, agent.portrait_url,
                           {"post_id": post_id, "content": post.content[:200], "sentiment": post.sentiment,
                            "hashtags": post.hashtags}, "social")

                _store_memory(session, agent.id, sim_id,
                             f"I posted: '{post.content[:100]}...'", "social", 0.6)

                posts_created.append({"id": post_id, "agent_id": agent.id, "content": post.content, "sentiment": post.sentiment})

            session.flush()

            for post_info in posts_created:
                for agent in agents:
                    if agent.id == post_info["agent_id"]:
                        continue
                    if random.random() > 0.4:
                        continue

                    reaction_type = random.choice(["like", "like", "like", "retweet"])
                    reaction = PostReaction(
                        post_id=post_info["id"],
                        agent_id=agent.id,
                        reaction_type=reaction_type,
                    )
                    session.add(reaction)

                    if reaction_type == "like":
                        _emit_event(session, sim_id, "like", agent.id, agent.name, agent.portrait_url,
                                   {"post_id": post_info["id"], "post_preview": post_info["content"][:80]}, "social")

            self._update_trending(session, sim_id)

            _emit_event(session, sim_id, "phase_end", data={"phase": "social_posting", "posts_count": len(posts_created)}, phase="social")

    # ------------------------------------------------------------------
    # Phase: Reddit Discussion
    # ------------------------------------------------------------------

    def run_reddit_discussion(self, sim_id: str, config: dict):
        """Agents create and discuss in Reddit-style threads."""
        llm = self._get_llm()
        topic = self._get_topic(sim_id, config)

        with get_db_session() as session:
            agents = session.query(AgentRecord).filter_by(sim_id=sim_id).all()
            if not agents:
                return

            _emit_event(session, sim_id, "phase_start", data={"phase": "reddit_discussion", "message": "Discussion threads are being created..."}, phase="discussion")

            thread_starters = sorted(agents, key=lambda a: a.activity_level or 0.5, reverse=True)[:max(2, len(agents) // 5)]

            for starter in thread_starters:
                ctx = _build_agent_context(session, starter, sim_id, topic)
                try:
                    result = llm.chat_json(messages=[
                        {"role": "system", "content": (
                            "You are starting a Reddit discussion thread about the topic. "
                            "Write a thought-provoking title and opening comment. "
                            "Return JSON: {\"title\": \"...\", \"content\": \"...\", \"subreddit\": \"r/SomethingRelevant\"}"
                        )},
                        {"role": "user", "content": ctx},
                    ])
                except Exception:
                    continue

                thread_id = f"thread_{_uid()}"
                thread = DiscussionThread(
                    id=thread_id,
                    sim_id=sim_id,
                    title=result.get("title", "Discussion")[:256],
                    author_id=starter.id,
                    subreddit=result.get("subreddit", "r/Simulation")[:64],
                    phase="discussion",
                )
                session.add(thread)

                comment = ThreadComment(
                    id=f"comment_{_uid()}",
                    thread_id=thread_id,
                    author_id=starter.id,
                    content=result.get("content", "")[:1000],
                    depth=0,
                )
                session.add(comment)

                _emit_event(session, sim_id, "thread_created", starter.id, starter.name, starter.portrait_url,
                           {"thread_id": thread_id, "title": thread.title, "subreddit": thread.subreddit}, "discussion")

                session.flush()

                repliers = [a for a in agents if a.id != starter.id]
                random.shuffle(repliers)
                for replier in repliers[:min(5, len(repliers))]:
                    if random.random() > (replier.activity_level or 0.5) + 0.2:
                        continue

                    rctx = _build_agent_context(session, replier, sim_id, topic)
                    try:
                        reply_result = llm.chat_json(messages=[
                            {"role": "system", "content": (
                                f"You are replying to a Reddit thread titled: '{thread.title}'. "
                                f"The opening post said: '{comment.content[:200]}'. "
                                "Write a thoughtful reply. "
                                "Return JSON: {\"content\": \"...\", \"vote\": \"upvote|downvote\"}"
                            )},
                            {"role": "user", "content": rctx},
                        ])
                    except Exception:
                        continue

                    reply = ThreadComment(
                        id=f"comment_{_uid()}",
                        thread_id=thread_id,
                        author_id=replier.id,
                        parent_comment_id=comment.id,
                        content=reply_result.get("content", "")[:1000],
                        depth=1,
                    )
                    session.add(reply)

                    vote = reply_result.get("vote", "upvote")
                    thread.score += 1 if vote == "upvote" else -1

                    _emit_event(session, sim_id, "comment", replier.id, replier.name, replier.portrait_url,
                               {"thread_id": thread_id, "content": reply.content[:150]}, "discussion")

            _emit_event(session, sim_id, "phase_end", data={"phase": "reddit_discussion"}, phase="discussion")

    # ------------------------------------------------------------------
    # Phase: Agent Debates
    # ------------------------------------------------------------------

    def run_agent_debates(self, sim_id: str, config: dict, num_debates: int = 2):
        """Pair agents with opposing views for multi-turn debates."""
        llm = self._get_llm()
        topic = self._get_topic(sim_id, config)

        with get_db_session() as session:
            states = (
                session.query(AgentStateRecord)
                .filter_by(sim_id=sim_id)
                .order_by(AgentStateRecord.created_at.desc())
                .all()
            )
            agent_sentiments = {}
            for s in states:
                if s.agent_id not in agent_sentiments:
                    agent_sentiments[s.agent_id] = s.sentiment or 5.0

            agents = session.query(AgentRecord).filter_by(sim_id=sim_id).all()
            agent_map = {a.id: a for a in agents}

            sorted_agents = sorted(agent_sentiments.items(), key=lambda x: x[1])
            if len(sorted_agents) < 2:
                return

            _emit_event(session, sim_id, "phase_start", data={"phase": "debates", "message": "Agent debates are starting..."}, phase="debate")

            pairs = []
            n = len(sorted_agents)
            for i in range(min(num_debates, n // 2)):
                low_id = sorted_agents[i][0]
                high_id = sorted_agents[-(i + 1)][0]
                if low_id != high_id and low_id in agent_map and high_id in agent_map:
                    pairs.append((low_id, high_id))

            for agent_a_id, agent_b_id in pairs:
                agent_a = agent_map[agent_a_id]
                agent_b = agent_map[agent_b_id]

                debate_id = f"debate_{_uid()}"
                debate = AgentDebate(
                    id=debate_id,
                    sim_id=sim_id,
                    topic=topic[:256],
                    agent_a_id=agent_a_id,
                    agent_b_id=agent_b_id,
                    agent_a_stance="skeptical",
                    agent_b_stance="supportive",
                    phase="debate",
                )
                session.add(debate)

                _emit_event(session, sim_id, "debate_start", data={
                    "debate_id": debate_id,
                    "agent_a": {"id": agent_a.id, "name": agent_a.name},
                    "agent_b": {"id": agent_b.id, "name": agent_b.name},
                    "topic": topic[:100],
                }, phase="debate")

                history = []
                for rnd in range(1, 4):
                    for speaker, opponent in [(agent_a, agent_b), (agent_b, agent_a)]:
                        ctx = _build_agent_context(session, speaker, sim_id, topic)
                        hist_text = "\n".join(f"[{h['name']}]: {h['content']}" for h in history[-4:])

                        try:
                            result = llm.chat_json(messages=[
                                {"role": "system", "content": (
                                    f"You are in a debate (round {rnd}/3) about: {topic[:200]}. "
                                    f"You are debating against {opponent.name}. "
                                    f"Previous exchanges:\n{hist_text}\n\n"
                                    "Make your argument concisely (max 200 words). "
                                    "Return JSON: {\"content\": \"...\", \"emotional_tone\": \"calm|passionate|frustrated|confident\"}"
                                )},
                                {"role": "user", "content": ctx},
                            ])
                        except Exception:
                            continue

                        turn_content = result.get("content", "")[:800]
                        tone = result.get("emotional_tone", "calm")

                        turn = DebateTurn(
                            debate_id=debate_id,
                            speaker_id=speaker.id,
                            content=turn_content,
                            round=rnd,
                            emotional_tone=tone,
                        )
                        session.add(turn)
                        history.append({"name": speaker.name, "content": turn_content})

                        _emit_event(session, sim_id, "debate_turn", speaker.id, speaker.name, speaker.portrait_url,
                                   {"debate_id": debate_id, "round": rnd, "content": turn_content[:150], "tone": tone}, "debate")

                try:
                    outcome_result = llm.chat_json(messages=[
                        {"role": "system", "content": (
                            "Based on the debate, who made stronger arguments? "
                            "Return JSON: {\"winner\": \"agent_a|agent_b|draw\", \"summary\": \"brief summary\"}"
                        )},
                        {"role": "user", "content": "\n".join(f"[{h['name']}]: {h['content']}" for h in history)},
                    ])
                    winner_key = outcome_result.get("winner", "draw")
                    debate.outcome = outcome_result.get("summary", "")
                    if winner_key == "agent_a":
                        debate.winner_id = agent_a_id
                    elif winner_key == "agent_b":
                        debate.winner_id = agent_b_id
                except Exception:
                    debate.outcome = "Inconclusive"

                _emit_event(session, sim_id, "debate_end", data={
                    "debate_id": debate_id,
                    "outcome": debate.outcome,
                    "winner_id": debate.winner_id,
                }, phase="debate")

                _store_memory(session, agent_a_id, sim_id,
                             f"Debated {agent_b.name} about {topic[:50]}. Outcome: {debate.outcome[:100]}", "debate", 0.8)
                _store_memory(session, agent_b_id, sim_id,
                             f"Debated {agent_a.name} about {topic[:50]}. Outcome: {debate.outcome[:100]}", "debate", 0.8)

            _emit_event(session, sim_id, "phase_end", data={"phase": "debates", "count": len(pairs)}, phase="debate")

    # ------------------------------------------------------------------
    # Phase: Opinion Shift
    # ------------------------------------------------------------------

    def run_opinion_shift(self, sim_id: str, config: dict):
        """Agents re-evaluate positions after social exposure."""
        llm = self._get_llm()
        topic = self._get_topic(sim_id, config)

        with get_db_session() as session:
            agents = session.query(AgentRecord).filter_by(sim_id=sim_id).all()
            if not agents:
                return

            _emit_event(session, sim_id, "phase_start", data={"phase": "opinion_shift", "message": "Agents are reconsidering their positions..."}, phase="shift")

            top_posts = (
                session.query(SocialPost)
                .filter_by(sim_id=sim_id)
                .order_by(SocialPost.virality_score.desc())
                .limit(5)
                .all()
            )
            social_summary = "\n".join(f"- @{p.agent_id[:8]}: '{p.content[:100]}' ({p.sentiment})" for p in top_posts)

            debates = session.query(AgentDebate).filter_by(sim_id=sim_id).all()
            debate_summary = "\n".join(f"- Debate: {d.outcome or 'ongoing'}" for d in debates[:3])

            for agent in agents:
                old_state = _get_latest_state(session, agent.id, sim_id)
                old_sentiment = old_state.sentiment if old_state else 5.0

                ctx = _build_agent_context(session, agent, sim_id, topic)

                try:
                    result = llm.chat_json(messages=[
                        {"role": "system", "content": (
                            "After seeing social media posts and debates, re-evaluate your position. "
                            f"Top social posts:\n{social_summary}\n\nDebate outcomes:\n{debate_summary}\n\n"
                            "Has your opinion changed? "
                            "Return JSON: {\"new_sentiment\": 1-10, \"shifted\": true/false, "
                            "\"reason\": \"why you changed or didn't\", "
                            "\"new_mood\": \"excited|calm|frustrated|anxious|confident|skeptical\"}"
                        )},
                        {"role": "user", "content": ctx},
                    ])
                except Exception:
                    continue

                new_sentiment = float(result.get("new_sentiment", old_sentiment))
                shifted = result.get("shifted", False)
                reason = result.get("reason", "")
                new_mood = result.get("new_mood", "neutral")

                new_state = AgentStateRecord(
                    agent_id=agent.id,
                    sim_id=sim_id,
                    phase="shift",
                    round=0,
                    emotional_state={"mood": new_mood, "intensity": min(10, abs(new_sentiment - old_sentiment) * 2 + 3)},
                    sentiment=max(0, min(10, new_sentiment)),
                    influence_score=old_state.influence_score if old_state else 0.5,
                    credibility=old_state.credibility if old_state else 0.5,
                    faction=old_state.faction if old_state else "",
                    opinion={"sentiment": new_sentiment, "reason": reason},
                )
                session.add(new_state)

                if shifted:
                    _emit_event(session, sim_id, "opinion_shift", agent.id, agent.name, agent.portrait_url, {
                        "old_sentiment": old_sentiment,
                        "new_sentiment": new_sentiment,
                        "reason": reason[:200],
                        "mood": new_mood,
                    }, "shift")

                    _store_memory(session, agent.id, sim_id,
                                 f"Changed opinion from {old_sentiment:.1f} to {new_sentiment:.1f}: {reason[:100]}", "shift", 0.9)

            _emit_event(session, sim_id, "phase_end", data={"phase": "opinion_shift"}, phase="shift")

    # ------------------------------------------------------------------
    # Emotional State Initialization
    # ------------------------------------------------------------------

    def initialize_agent_states(self, sim_id: str, initial_responses: list = None):
        """Create initial AgentStateRecords from population + evaluation results."""
        with get_db_session() as session:
            agents = session.query(AgentRecord).filter_by(sim_id=sim_id).all()
            resp_map = {}
            if initial_responses:
                for r in initial_responses:
                    resp_map[r.get("agent_id", "")] = r

            for agent in agents:
                r = resp_map.get(agent.id, {})
                interest = r.get("interest", 5)
                reaction = r.get("reaction", "neutral")

                mood = "neutral"
                if reaction in ("positive", "interested", "excited"):
                    mood = "excited"
                elif reaction in ("negative", "critical", "skeptical"):
                    mood = "frustrated"

                personality = agent.personality or {}
                ptype = personality.get("type", "").lower()
                if "analytical" in ptype:
                    mood = "calm"

                state = AgentStateRecord(
                    agent_id=agent.id,
                    sim_id=sim_id,
                    phase="evaluation",
                    round=0,
                    emotional_state={"mood": mood, "intensity": 5, "triggers": []},
                    sentiment=float(interest),
                    influence_score=0.3 + random.random() * 0.4,
                    credibility=0.5,
                    faction="",
                    opinion={"initial_interest": interest, "reaction": reaction},
                )
                session.add(state)

                _store_memory(session, agent.id, sim_id,
                             f"Initial evaluation: interest={interest}/10, reaction={reaction}", "evaluation", 0.7)

    # ------------------------------------------------------------------
    # Faction Detection
    # ------------------------------------------------------------------

    def detect_factions(self, sim_id: str):
        """Cluster agents by opinion similarity into factions."""
        with get_db_session() as session:
            agents = session.query(AgentRecord).filter_by(sim_id=sim_id).all()
            sentiments = {}
            for agent in agents:
                state = _get_latest_state(session, agent.id, sim_id)
                sentiments[agent.id] = state.sentiment if state else 5.0

            supporters = [aid for aid, s in sentiments.items() if s >= 7]
            skeptics = [aid for aid, s in sentiments.items() if s <= 4]
            moderates = [aid for aid, s in sentiments.items() if 4 < s < 7]

            for aid in supporters:
                state = _get_latest_state(session, aid, sim_id)
                if state:
                    new = AgentStateRecord(
                        agent_id=aid, sim_id=sim_id, phase="faction",
                        emotional_state=state.emotional_state, sentiment=state.sentiment,
                        influence_score=state.influence_score, credibility=state.credibility,
                        faction="Supporters", opinion=state.opinion,
                    )
                    session.add(new)
                    _emit_event(session, sim_id, "faction_join", aid, data={"faction": "Supporters"}, phase="faction")

            for aid in skeptics:
                state = _get_latest_state(session, aid, sim_id)
                if state:
                    new = AgentStateRecord(
                        agent_id=aid, sim_id=sim_id, phase="faction",
                        emotional_state=state.emotional_state, sentiment=state.sentiment,
                        influence_score=state.influence_score, credibility=state.credibility,
                        faction="Skeptics", opinion=state.opinion,
                    )
                    session.add(new)
                    _emit_event(session, sim_id, "faction_join", aid, data={"faction": "Skeptics"}, phase="faction")

            for aid in moderates:
                state = _get_latest_state(session, aid, sim_id)
                if state:
                    new = AgentStateRecord(
                        agent_id=aid, sim_id=sim_id, phase="faction",
                        emotional_state=state.emotional_state, sentiment=state.sentiment,
                        influence_score=state.influence_score, credibility=state.credibility,
                        faction="Moderates", opinion=state.opinion,
                    )
                    session.add(new)

    # ------------------------------------------------------------------
    # Trending
    # ------------------------------------------------------------------

    def _update_trending(self, session, sim_id: str):
        """Calculate trending hashtags from social posts."""
        posts = session.query(SocialPost).filter_by(sim_id=sim_id).all()
        tag_counts = defaultdict(int)
        for p in posts:
            for tag in (p.hashtags or []):
                tag_counts[tag.lower()] += 1

        session.query(TrendingTopic).filter_by(sim_id=sim_id).delete()
        for tag, count in sorted(tag_counts.items(), key=lambda x: -x[1])[:20]:
            tt = TrendingTopic(
                sim_id=sim_id,
                hashtag=tag,
                count=count,
                virality_score=count * 1.5,
                phase="social",
            )
            session.add(tt)

    # ------------------------------------------------------------------
    # Influence Propagation
    # ------------------------------------------------------------------

    def propagate_influence(self, sim_id: str):
        """Update influence scores based on social engagement."""
        with get_db_session() as session:
            agents = session.query(AgentRecord).filter_by(sim_id=sim_id).all()

            for agent in agents:
                posts = session.query(SocialPost).filter_by(sim_id=sim_id, agent_id=agent.id).all()
                total_reactions = 0
                for p in posts:
                    total_reactions += len(p.reactions) if p.reactions else 0

                debates_won = session.query(AgentDebate).filter_by(sim_id=sim_id, winner_id=agent.id).count()

                influence = min(1.0, 0.3 + total_reactions * 0.05 + debates_won * 0.15)

                state = _get_latest_state(session, agent.id, sim_id)
                if state:
                    new = AgentStateRecord(
                        agent_id=agent.id, sim_id=sim_id, phase="influence",
                        emotional_state=state.emotional_state, sentiment=state.sentiment,
                        influence_score=influence, credibility=state.credibility + debates_won * 0.1,
                        faction=state.faction, opinion=state.opinion,
                    )
                    session.add(new)

    # ------------------------------------------------------------------
    # External Event Injection
    # ------------------------------------------------------------------

    def inject_external_event(self, sim_id: str, event_text: str):
        """Inject an external event into the simulation."""
        with get_db_session() as session:
            _emit_event(session, sim_id, "external_event", data={
                "content": event_text,
                "message": f"BREAKING: {event_text}",
            }, phase="event")

            agents = session.query(AgentRecord).filter_by(sim_id=sim_id).all()
            for agent in agents:
                _store_memory(session, agent.id, sim_id,
                             f"External event: {event_text}", "event", 0.9)

    # ------------------------------------------------------------------
    # Active agent selection (time-of-day + activity level)
    # ------------------------------------------------------------------

    def conduct_interviews(self, sim_id: str, config: dict, sample_size: int = 10) -> list:
        """Conduct brief LLM-powered interviews with a sample of agents after simulation."""
        from ...models.simulation_base import SimulationStore

        data_dir = SimulationStore.get_data_dir(sim_id)
        pop_path = os.path.join(data_dir, "population.json")

        if not os.path.exists(pop_path):
            logger.warning(f"[{sim_id}] No population.json found for interviews")
            return []

        with open(pop_path, "r", encoding="utf-8") as f:
            population = json.load(f)

        if not population:
            return []

        sample = random.sample(population, min(sample_size, len(population)))
        topic = (
            config.get("idea")
            or config.get("business_idea")
            or config.get("prompt")
            or config.get("product_description")
            or config.get("scenario_description")
            or "the topic"
        )

        llm = self._get_llm()
        interviews = []
        for agent in sample:
            name = agent.get("name", "Agent")
            bio = agent.get("bio", "") or (agent.get("metadata") or {}).get("bio", "")
            occupation = agent.get("occupation", agent.get("role", ""))

            try:
                response = llm.chat(
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                f"You are {name}, a {occupation}. {bio}\n"
                                "You just participated in a simulation. Answer the interview question naturally "
                                "and in character (2-3 sentences). Be specific about your experience."
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                f"The simulation was about: {topic}\n\n"
                                "Question: What was your overall impression? What surprised you most, "
                                "and would you change your initial opinion based on what you learned?"
                            ),
                        },
                    ],
                    temperature=0.7,
                    max_tokens=300,
                )

                interviews.append({
                    "agent_name": name,
                    "agent_id": agent.get("id", ""),
                    "occupation": occupation,
                    "response": response,
                    "timestamp": datetime.now().isoformat(),
                })
            except Exception as exc:
                logger.warning(f"Interview failed for {name}: {exc}")

        interviews_path = os.path.join(data_dir, "interviews.json")
        with open(interviews_path, "w", encoding="utf-8") as f:
            json.dump(interviews, f, ensure_ascii=False, indent=2)

        logger.info(f"[{sim_id}] Conducted {len(interviews)} interviews")
        return interviews

    def _select_active_agents(self, sim_id: str, sim_hour: int, round_num: int) -> list:
        """Select which agents are active this round based on time and activity level."""
        hour_multipliers = {
            0: 0.1, 1: 0.05, 2: 0.05, 3: 0.05, 4: 0.1, 5: 0.2,
            6: 0.4, 7: 0.6, 8: 0.8, 9: 0.9, 10: 1.0, 11: 1.0,
            12: 0.9, 13: 0.85, 14: 0.9, 15: 0.95, 16: 1.0, 17: 1.0,
            18: 0.9, 19: 0.85, 20: 0.8, 21: 0.7, 22: 0.5, 23: 0.3,
        }
        time_mult = hour_multipliers.get(sim_hour % 24, 0.5)

        with get_db_session() as session:
            agents = session.query(AgentRecord).filter_by(sim_id=sim_id).all()
            active = []
            for agent in agents:
                activity = agent.activity_level or 0.5
                threshold = 1.0 - (activity * time_mult)
                if random.random() > threshold:
                    active.append(agent)

            if len(active) < max(3, len(agents) // 5):
                remaining = [a for a in agents if a not in active]
                random.shuffle(remaining)
                active.extend(remaining[:max(3, len(agents) // 5) - len(active)])

            return active

    # ------------------------------------------------------------------
    # Per-round social posting (lightweight, for each round)
    # ------------------------------------------------------------------

    def _round_social_posting(self, sim_id: str, config: dict, active_agents: list, round_num: int):
        """Agents create posts during this simulation round."""
        llm = self._get_llm()
        topic = self._get_topic(sim_id, config)

        with get_db_session() as session:
            posters = [a for a in active_agents if random.random() < (a.activity_level or 0.5) + 0.2]
            if not posters:
                return

            all_agents_map = {a.id: a for a in session.query(AgentRecord).filter_by(sim_id=sim_id).all()}

            for agent in posters:
                db_agent = all_agents_map.get(agent.id)
                if not db_agent:
                    continue

                ctx = _build_agent_context(session, db_agent, sim_id, topic)
                try:
                    result = llm.chat_json(messages=[
                        {"role": "system", "content": (
                            f"You are a social media user posting about a topic (round {round_num+1}). "
                            "Write a short tweet (max 280 chars) expressing your opinion. "
                            "Return JSON: {\"content\": \"...\", \"hashtags\": [\"#tag1\"], \"sentiment\": \"positive|negative|neutral|mixed\"}"
                        )},
                        {"role": "user", "content": ctx},
                    ])
                except Exception:
                    continue

                post_id = f"post_{_uid()}"
                post = SocialPost(
                    id=post_id, sim_id=sim_id, agent_id=db_agent.id,
                    content=result.get("content", "")[:500],
                    hashtags=result.get("hashtags", []),
                    sentiment=result.get("sentiment", "neutral"),
                    post_type="tweet", phase=f"round_{round_num}",
                )
                session.add(post)

                _emit_event(session, sim_id, "post", db_agent.id, db_agent.name, db_agent.portrait_url,
                           {"post_id": post_id, "content": post.content[:200], "sentiment": post.sentiment,
                            "round": round_num, "hashtags": post.hashtags}, f"round_{round_num}")

                _store_memory(session, db_agent.id, sim_id,
                             f"[Round {round_num+1}] I posted: '{post.content[:80]}...'", "social", 0.5)

            self._update_trending(session, sim_id)

    # ------------------------------------------------------------------
    # Per-round discussions (every 2nd round)
    # ------------------------------------------------------------------

    def _round_discussions(self, sim_id: str, config: dict, active_agents: list, round_num: int):
        """Run lightweight discussion threads during a round."""
        llm = self._get_llm()
        topic = self._get_topic(sim_id, config)

        with get_db_session() as session:
            all_agents_map = {a.id: a for a in session.query(AgentRecord).filter_by(sim_id=sim_id).all()}
            starters = sorted(active_agents, key=lambda a: a.activity_level or 0.5, reverse=True)[:max(1, len(active_agents) // 4)]

            for starter in starters:
                db_starter = all_agents_map.get(starter.id)
                if not db_starter:
                    continue

                ctx = _build_agent_context(session, db_starter, sim_id, topic)
                try:
                    result = llm.chat_json(messages=[
                        {"role": "system", "content": (
                            f"You are starting a Reddit discussion thread about the topic (round {round_num+1}). "
                            "Write a thought-provoking title and opening comment. "
                            "Return JSON: {\"title\": \"...\", \"content\": \"...\", \"subreddit\": \"r/SomethingRelevant\"}"
                        )},
                        {"role": "user", "content": ctx},
                    ])
                except Exception:
                    continue

                thread_id = f"thread_{_uid()}"
                thread = DiscussionThread(
                    id=thread_id, sim_id=sim_id,
                    title=result.get("title", "Discussion")[:256],
                    author_id=db_starter.id,
                    subreddit=result.get("subreddit", "r/Simulation")[:64],
                    phase=f"round_{round_num}",
                )
                session.add(thread)

                opening = ThreadComment(
                    id=f"comment_{_uid()}", thread_id=thread_id,
                    author_id=db_starter.id,
                    content=result.get("content", "")[:1000], depth=0,
                )
                session.add(opening)
                session.flush()

                _emit_event(session, sim_id, "thread_created", db_starter.id, db_starter.name, db_starter.portrait_url,
                           {"thread_id": thread_id, "title": thread.title, "round": round_num}, f"round_{round_num}")

                repliers = [a for a in active_agents if a.id != starter.id]
                random.shuffle(repliers)
                for replier in repliers[:min(3, len(repliers))]:
                    db_replier = all_agents_map.get(replier.id)
                    if not db_replier:
                        continue
                    if random.random() > (db_replier.activity_level or 0.5) + 0.1:
                        continue

                    rctx = _build_agent_context(session, db_replier, sim_id, topic)
                    try:
                        reply_result = llm.chat_json(messages=[
                            {"role": "system", "content": (
                                f"You are replying to a Reddit thread titled: '{thread.title}'. "
                                f"The opening post said: '{opening.content[:200]}'. "
                                "Write a thoughtful reply. "
                                "Return JSON: {\"content\": \"...\", \"vote\": \"upvote|downvote\"}"
                            )},
                            {"role": "user", "content": rctx},
                        ])
                    except Exception:
                        continue

                    reply = ThreadComment(
                        id=f"comment_{_uid()}", thread_id=thread_id,
                        author_id=db_replier.id, parent_comment_id=opening.id,
                        content=reply_result.get("content", "")[:1000], depth=1,
                    )
                    session.add(reply)

                    vote = reply_result.get("vote", "upvote")
                    thread.score += 1 if vote == "upvote" else -1

                    _emit_event(session, sim_id, "comment", db_replier.id, db_replier.name, db_replier.portrait_url,
                               {"thread_id": thread_id, "content": reply.content[:150], "round": round_num}, f"round_{round_num}")

    # ------------------------------------------------------------------
    # Per-round debates (every 4th round)
    # ------------------------------------------------------------------

    def _round_debates(self, sim_id: str, config: dict, round_num: int):
        """Run a debate between opposing agents during a round."""
        self.run_agent_debates(sim_id, config, num_debates=1)

    # ------------------------------------------------------------------
    # Per-round opinion shift
    # ------------------------------------------------------------------

    def _round_opinion_shift(self, sim_id: str, config: dict, round_num: int):
        """Lightweight opinion shift based on round activity."""
        llm = self._get_llm()
        topic = self._get_topic(sim_id, config)

        with get_db_session() as session:
            agents = session.query(AgentRecord).filter_by(sim_id=sim_id).all()
            if not agents:
                return

            recent_posts = (
                session.query(SocialPost)
                .filter_by(sim_id=sim_id)
                .order_by(SocialPost.created_at.desc())
                .limit(5)
                .all()
            )
            social_summary = "\n".join(f"- @{p.agent_id[:8]}: '{p.content[:80]}' ({p.sentiment})" for p in recent_posts)

            sample = random.sample(agents, min(len(agents), max(5, len(agents) // 3)))

            for agent in sample:
                old_state = _get_latest_state(session, agent.id, sim_id)
                old_sentiment = old_state.sentiment if old_state else 5.0

                ctx = _build_agent_context(session, agent, sim_id, topic)
                try:
                    result = llm.chat_json(messages=[
                        {"role": "system", "content": (
                            f"After round {round_num+1} of social discussion, briefly re-evaluate your position. "
                            f"Recent social posts:\n{social_summary}\n\n"
                            "Return JSON: {\"new_sentiment\": 1-10, \"shifted\": true/false, "
                            "\"reason\": \"brief reason\", \"new_mood\": \"excited|calm|frustrated|anxious|confident|skeptical\"}"
                        )},
                        {"role": "user", "content": ctx},
                    ])
                except Exception:
                    continue

                new_sentiment = float(result.get("new_sentiment", old_sentiment))
                new_mood = result.get("new_mood", "neutral")
                shifted = result.get("shifted", False)

                new_state = AgentStateRecord(
                    agent_id=agent.id, sim_id=sim_id,
                    phase=f"round_{round_num}", round=round_num,
                    emotional_state={"mood": new_mood, "intensity": min(10, abs(new_sentiment - old_sentiment) * 2 + 3)},
                    sentiment=max(0, min(10, new_sentiment)),
                    influence_score=old_state.influence_score if old_state else 0.5,
                    credibility=old_state.credibility if old_state else 0.5,
                    faction=old_state.faction if old_state else "",
                    opinion={"sentiment": new_sentiment, "reason": result.get("reason", "")},
                )
                session.add(new_state)

                if shifted:
                    _emit_event(session, sim_id, "opinion_shift", agent.id, agent.name, agent.portrait_url, {
                        "old_sentiment": old_sentiment, "new_sentiment": new_sentiment,
                        "reason": result.get("reason", "")[:200], "mood": new_mood, "round": round_num,
                    }, f"round_{round_num}")

    # ------------------------------------------------------------------
    # Multi-Round Simulation Runner
    # ------------------------------------------------------------------

    def run_simulation_rounds(self, sim_id: str, config: dict, initial_responses: list = None):
        """
        Run the multi-round social simulation with per-round social phases.
        This replaces the old post-hoc run_social_phases().
        """
        from ...models.simulation_base import SimulationStore, SimStatus

        total_hours = config.get("total_simulation_hours", 4)
        minutes_per_round = config.get("minutes_per_round", 30)
        max_rounds = config.get("max_rounds", max(4, (total_hours * 60) // minutes_per_round))

        logger.info(f"[{sim_id}] Starting multi-round simulation: {max_rounds} rounds, {total_hours}h simulated")

        self.initialize_agent_states(sim_id, initial_responses)
        logger.info(f"[{sim_id}] Agent states initialized")

        self.detect_factions(sim_id)
        logger.info(f"[{sim_id}] Initial factions detected")

        with get_db_session() as session:
            _emit_event(session, sim_id, "simulation_start", data={
                "max_rounds": max_rounds, "total_hours": total_hours,
                "message": f"Multi-round simulation starting: {max_rounds} rounds over {total_hours} simulated hours",
            }, phase="simulation")

        for round_num in range(max_rounds):
            sim = SimulationStore.get(sim_id)
            if sim and sim.status in (SimStatus.STOPPED, SimStatus.FAILED):
                logger.info(f"[{sim_id}] Simulation stopped/failed at round {round_num}")
                return

            sim_hour = (round_num * minutes_per_round) // 60 % 24
            active_agents = self._select_active_agents(sim_id, sim_hour, round_num)

            with get_db_session() as session:
                _emit_event(session, sim_id, "round_start", data={
                    "round": round_num + 1, "total_rounds": max_rounds,
                    "sim_hour": sim_hour, "active_count": len(active_agents),
                    "message": f"Round {round_num + 1}/{max_rounds} — Hour {sim_hour}:00 — {len(active_agents)} active agents",
                }, phase=f"round_{round_num}")

            logger.info(f"[{sim_id}] Round {round_num + 1}/{max_rounds}: hour={sim_hour}, active={len(active_agents)}")

            self._round_social_posting(sim_id, config, active_agents, round_num)

            if round_num % 2 == 1:
                self._round_discussions(sim_id, config, active_agents, round_num)

            if round_num % 4 == 3:
                self._round_debates(sim_id, config, round_num)

            self._round_opinion_shift(sim_id, config, round_num)

            if round_num % 3 == 2:
                self.propagate_influence(sim_id)

            progress = int((round_num + 1) / max_rounds * 100)
            SimulationStore.update_status(
                sim_id, SimStatus.RUNNING,
                progress=progress,
                actions_count=round_num + 1,
                current_round=round_num + 1,
                total_rounds=max_rounds,
                phase=f"round_{round_num}",
            )

            with get_db_session() as session:
                _emit_event(session, sim_id, "round_end", data={
                    "round": round_num + 1, "progress": progress,
                }, phase=f"round_{round_num}")

        self.detect_factions(sim_id)
        logger.info(f"[{sim_id}] Final factions detected")

        with get_db_session() as session:
            _emit_event(session, sim_id, "simulation_end", data={
                "total_rounds": max_rounds,
                "message": f"Multi-round simulation complete after {max_rounds} rounds",
            }, phase="simulation")

        try:
            self.conduct_interviews(sim_id, config)
        except Exception as exc:
            logger.warning(f"[{sim_id}] Interview phase failed: {exc}")

        logger.info(f"[{sim_id}] Multi-round simulation complete!")

    # ------------------------------------------------------------------
    # Run All Social Phases (legacy, kept for backwards compat)
    # ------------------------------------------------------------------

    def run_social_phases(self, sim_id: str, config: dict, initial_responses: list = None):
        """Run the complete social simulation pipeline (legacy single-pass mode)."""
        logger.info(f"[{sim_id}] Starting social simulation phases...")

        self.initialize_agent_states(sim_id, initial_responses)
        logger.info(f"[{sim_id}] Agent states initialized")

        self.detect_factions(sim_id)
        logger.info(f"[{sim_id}] Factions detected")

        self.run_social_posting(sim_id, config)
        logger.info(f"[{sim_id}] Social posting complete")

        self.run_reddit_discussion(sim_id, config)
        logger.info(f"[{sim_id}] Reddit discussion complete")

        self.run_agent_debates(sim_id, config)
        logger.info(f"[{sim_id}] Agent debates complete")

        self.propagate_influence(sim_id)
        logger.info(f"[{sim_id}] Influence propagated")

        self.run_opinion_shift(sim_id, config)
        logger.info(f"[{sim_id}] Opinion shift complete")

        self.detect_factions(sim_id)
        logger.info(f"[{sim_id}] Final factions detected")

        logger.info(f"[{sim_id}] Social simulation phases complete!")
