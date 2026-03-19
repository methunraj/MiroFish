"""
PostgreSQL models for simulation data.
Replaces file-based SimulationStore with proper DB-backed persistence.
"""
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, DateTime, Float, Integer, Boolean, ForeignKey, Index, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from .graph_db import Base


class SimulationRecord(Base):
    __tablename__ = "simulations"
    id = Column(String(64), primary_key=True)
    mode = Column(String(32), nullable=False)
    name = Column(String(256), default="Untitled Simulation")
    status = Column(String(32), default="pending")
    config = Column(JSONB, default=dict)
    population_count = Column(Integer, default=0)
    actions_count = Column(Integer, default=0)
    report_id = Column(String(64), nullable=True)
    report_data = Column(JSONB, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    agents = relationship("AgentRecord", back_populates="simulation", cascade="all, delete-orphan")
    events = relationship("SimulationEvent", back_populates="simulation", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "mode": self.mode,
            "name": self.name,
            "status": self.status,
            "config": self.config or {},
            "population_count": self.population_count or 0,
            "actions_count": self.actions_count or 0,
            "report_id": self.report_id,
            "error": self.error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class AgentRecord(Base):
    __tablename__ = "agents"
    id = Column(String(64), primary_key=True)
    sim_id = Column(String(64), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(256), default="Agent")
    role = Column(String(64), default="consumer")
    demographics = Column(JSONB, default=dict)
    personality = Column(JSONB, default=dict)
    portrait_url = Column(String(512), default="")
    activity_level = Column(Float, default=0.5)
    bio = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    simulation = relationship("SimulationRecord", back_populates="agents")
    states = relationship("AgentStateRecord", back_populates="agent", cascade="all, delete-orphan")
    memories = relationship("AgentMemory", back_populates="agent", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_agents_sim_id", "sim_id"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "sim_id": self.sim_id,
            "name": self.name,
            "role": self.role,
            "demographics": self.demographics or {},
            "personality": self.personality or {},
            "portrait_url": self.portrait_url or "",
            "activity_level": self.activity_level or 0.5,
            "bio": self.bio or "",
        }


class AgentStateRecord(Base):
    __tablename__ = "agent_states"
    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(String(64), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    sim_id = Column(String(64), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False)
    phase = Column(String(32), default="evaluation")
    round = Column(Integer, default=0)
    emotional_state = Column(JSONB, default=dict)
    sentiment = Column(Float, default=0.5)
    influence_score = Column(Float, default=0.5)
    credibility = Column(Float, default=0.5)
    faction = Column(String(128), default="")
    opinion = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    agent = relationship("AgentRecord", back_populates="states")

    __table_args__ = (
        Index("ix_agent_states_agent_sim", "agent_id", "sim_id"),
        Index("ix_agent_states_phase", "sim_id", "phase"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "sim_id": self.sim_id,
            "phase": self.phase,
            "round": self.round,
            "emotional_state": self.emotional_state or {},
            "sentiment": self.sentiment,
            "influence_score": self.influence_score,
            "credibility": self.credibility,
            "faction": self.faction or "",
            "opinion": self.opinion or {},
        }


class AgentMemory(Base):
    __tablename__ = "agent_memories"
    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(String(64), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    sim_id = Column(String(64), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    memory_type = Column(String(32), default="event")
    importance = Column(Float, default=0.5)
    embedding = Column(Vector(768), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    agent = relationship("AgentRecord", back_populates="memories")

    __table_args__ = (
        Index("ix_agent_memories_agent", "agent_id", "sim_id"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "content": self.content,
            "memory_type": self.memory_type,
            "importance": self.importance,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SimulationEvent(Base):
    """Unified event log powering the live Simulation Theater SSE stream."""
    __tablename__ = "simulation_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sim_id = Column(String(64), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(32), nullable=False)
    agent_id = Column(String(64), nullable=True)
    agent_name = Column(String(256), nullable=True)
    agent_portrait = Column(String(512), nullable=True)
    data = Column(JSONB, default=dict)
    phase = Column(String(32), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    simulation = relationship("SimulationRecord", back_populates="events")

    __table_args__ = (
        Index("ix_sim_events_sim", "sim_id"),
        Index("ix_sim_events_type", "sim_id", "event_type"),
        Index("ix_sim_events_created", "sim_id", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "sim_id": self.sim_id,
            "event_type": self.event_type,
            "agent_id": self.agent_id,
            "agent_name": self.agent_name,
            "agent_portrait": self.agent_portrait,
            "data": self.data or {},
            "phase": self.phase,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
