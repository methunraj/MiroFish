"""
Graph database models
SQLAlchemy ORM models for graph storage (nodes, edges, episodes, ontology)
"""

from datetime import datetime
from sqlalchemy import (
    Column, String, Text, DateTime, Boolean, ForeignKey, Index,
    create_engine, text
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import (
    relationship, sessionmaker, scoped_session, declarative_base
)
from contextlib import contextmanager
from pgvector.sqlalchemy import Vector
import uuid

from ..config import Config

Base = declarative_base()


class Graph(Base):
    """Graph metadata"""
    __tablename__ = 'graphs'

    graph_id = Column(String(64), primary_key=True)
    name = Column(String(256), nullable=False)
    description = Column(Text, default='')
    ontology = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    nodes = relationship('Node', back_populates='graph', cascade='all, delete-orphan')
    edges = relationship('Edge', back_populates='graph', cascade='all, delete-orphan')
    episodes = relationship('Episode', back_populates='graph', cascade='all, delete-orphan')


class Node(Base):
    """Entity node"""
    __tablename__ = 'nodes'

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    graph_id = Column(String(64), ForeignKey('graphs.graph_id', ondelete='CASCADE'), nullable=False)
    name = Column(Text, nullable=False, default='')
    labels = Column(ARRAY(Text), default=list)
    summary = Column(Text, default='')
    attributes = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    graph = relationship('Graph', back_populates='nodes')
    edges_source = relationship('Edge', back_populates='source_node', foreign_keys='Edge.source_node_uuid')
    edges_target = relationship('Edge', back_populates='target_node', foreign_keys='Edge.target_node_uuid')

    __table_args__ = (
        Index('ix_nodes_graph_id', 'graph_id'),
        Index('ix_nodes_name', 'name'),
    )


class Edge(Base):
    """Relationship edge"""
    __tablename__ = 'edges'

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    graph_id = Column(String(64), ForeignKey('graphs.graph_id', ondelete='CASCADE'), nullable=False)
    name = Column(Text, default='')
    fact = Column(Text, default='')
    source_node_uuid = Column(UUID(as_uuid=True), ForeignKey('nodes.uuid', ondelete='SET NULL'), nullable=True)
    target_node_uuid = Column(UUID(as_uuid=True), ForeignKey('nodes.uuid', ondelete='SET NULL'), nullable=True)
    attributes = Column(JSONB, default=dict)
    valid_at = Column(DateTime, nullable=True)
    invalid_at = Column(DateTime, nullable=True)
    expired_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    graph = relationship('Graph', back_populates='edges')
    source_node = relationship('Node', back_populates='edges_source', foreign_keys=[source_node_uuid])
    target_node = relationship('Node', back_populates='edges_target', foreign_keys=[target_node_uuid])

    __table_args__ = (
        Index('ix_edges_graph_id', 'graph_id'),
        Index('ix_edges_source', 'source_node_uuid'),
        Index('ix_edges_target', 'target_node_uuid'),
    )


class Episode(Base):
    """Text chunk (for entity extraction)"""
    __tablename__ = 'episodes'

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    graph_id = Column(String(64), ForeignKey('graphs.graph_id', ondelete='CASCADE'), nullable=False)
    content = Column(Text, nullable=False)
    type = Column(String(32), default='text')
    processed = Column(Boolean, default=False)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    graph = relationship('Graph', back_populates='episodes')

    __table_args__ = (
        Index('ix_episodes_graph_id', 'graph_id'),
        Index('ix_episodes_processed', 'graph_id', 'processed'),
    )


# Import models that share this Base so their tables are created by init_db()
# (imported at module level to register with Base.metadata)
from . import simulation_db  # noqa: F401, E402
from . import social_db  # noqa: F401, E402


# Module-level engine and session factory
_engine = None
_session_factory = None


def _get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(
            Config.DATABASE_URL,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
        )
    return _engine


def _get_session_factory():
    global _session_factory
    if _session_factory is None:
        _session_factory = scoped_session(sessionmaker(bind=_get_engine()))
    return _session_factory


def init_db():
    """Initialize database tables"""
    engine = _get_engine()
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    Base.metadata.create_all(engine)


@contextmanager
def get_db_session():
    """Get a new database session (use as context manager)"""
    factory = _get_session_factory()
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
