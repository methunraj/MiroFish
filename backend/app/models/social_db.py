"""
PostgreSQL models for social simulation data.
Twitter posts, Reddit threads, agent debates, reactions, trending.
"""
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, DateTime, Float, Integer, ForeignKey, Index
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from .graph_db import Base


class SocialPost(Base):
    __tablename__ = "social_posts"
    id = Column(String(64), primary_key=True)
    sim_id = Column(String(64), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False)
    agent_id = Column(String(64), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    hashtags = Column(JSONB, default=list)
    sentiment = Column(String(32), default="neutral")
    virality_score = Column(Float, default=0.0)
    parent_id = Column(String(64), nullable=True)
    post_type = Column(String(16), default="tweet")
    phase = Column(String(32), default="social")
    created_at = Column(DateTime, default=datetime.utcnow)

    reactions = relationship("PostReaction", back_populates="post", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_social_posts_sim", "sim_id"),
        Index("ix_social_posts_agent", "agent_id"),
        Index("ix_social_posts_parent", "parent_id"),
        Index("ix_social_posts_virality", "sim_id", "virality_score"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "sim_id": self.sim_id,
            "agent_id": self.agent_id,
            "content": self.content,
            "hashtags": self.hashtags or [],
            "sentiment": self.sentiment,
            "virality_score": self.virality_score,
            "parent_id": self.parent_id,
            "post_type": self.post_type,
            "phase": self.phase,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "likes": sum(1 for r in (self.reactions or []) if r.reaction_type == "like"),
            "retweets": sum(1 for r in (self.reactions or []) if r.reaction_type == "retweet"),
        }


class PostReaction(Base):
    __tablename__ = "post_reactions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    post_id = Column(String(64), ForeignKey("social_posts.id", ondelete="CASCADE"), nullable=False)
    agent_id = Column(String(64), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    reaction_type = Column(String(16), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    post = relationship("SocialPost", back_populates="reactions")

    __table_args__ = (
        Index("ix_post_reactions_post", "post_id"),
    )


class DiscussionThread(Base):
    __tablename__ = "discussion_threads"
    id = Column(String(64), primary_key=True)
    sim_id = Column(String(64), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(512), nullable=False)
    author_id = Column(String(64), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    subreddit = Column(String(128), default="r/Simulation")
    score = Column(Integer, default=0)
    phase = Column(String(32), default="discussion")
    created_at = Column(DateTime, default=datetime.utcnow)

    comments = relationship("ThreadComment", back_populates="thread", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_discussion_threads_sim", "sim_id"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "sim_id": self.sim_id,
            "title": self.title,
            "author_id": self.author_id,
            "subreddit": self.subreddit,
            "score": self.score,
            "phase": self.phase,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "comment_count": len(self.comments) if self.comments else 0,
        }


class ThreadComment(Base):
    __tablename__ = "thread_comments"
    id = Column(String(64), primary_key=True)
    thread_id = Column(String(64), ForeignKey("discussion_threads.id", ondelete="CASCADE"), nullable=False)
    author_id = Column(String(64), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    parent_comment_id = Column(String(64), nullable=True)
    content = Column(Text, nullable=False)
    score = Column(Integer, default=0)
    depth = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    thread = relationship("DiscussionThread", back_populates="comments")

    __table_args__ = (
        Index("ix_thread_comments_thread", "thread_id"),
        Index("ix_thread_comments_parent", "parent_comment_id"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "thread_id": self.thread_id,
            "author_id": self.author_id,
            "parent_comment_id": self.parent_comment_id,
            "content": self.content,
            "score": self.score,
            "depth": self.depth,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AgentDebate(Base):
    __tablename__ = "agent_debates"
    id = Column(String(64), primary_key=True)
    sim_id = Column(String(64), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False)
    topic = Column(String(512), nullable=False)
    agent_a_id = Column(String(64), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    agent_b_id = Column(String(64), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    agent_a_stance = Column(String(32), default="for")
    agent_b_stance = Column(String(32), default="against")
    outcome = Column(Text, nullable=True)
    winner_id = Column(String(64), nullable=True)
    phase = Column(String(32), default="debate")
    created_at = Column(DateTime, default=datetime.utcnow)

    turns = relationship("DebateTurn", back_populates="debate", cascade="all, delete-orphan", order_by="DebateTurn.round")

    __table_args__ = (
        Index("ix_agent_debates_sim", "sim_id"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "sim_id": self.sim_id,
            "topic": self.topic,
            "agent_a_id": self.agent_a_id,
            "agent_b_id": self.agent_b_id,
            "agent_a_stance": self.agent_a_stance,
            "agent_b_stance": self.agent_b_stance,
            "outcome": self.outcome,
            "winner_id": self.winner_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "turns": [t.to_dict() for t in (self.turns or [])],
        }


class DebateTurn(Base):
    __tablename__ = "debate_turns"
    id = Column(Integer, primary_key=True, autoincrement=True)
    debate_id = Column(String(64), ForeignKey("agent_debates.id", ondelete="CASCADE"), nullable=False)
    speaker_id = Column(String(64), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    round = Column(Integer, default=1)
    emotional_tone = Column(String(32), default="neutral")
    created_at = Column(DateTime, default=datetime.utcnow)

    debate = relationship("AgentDebate", back_populates="turns")

    __table_args__ = (
        Index("ix_debate_turns_debate", "debate_id"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "debate_id": self.debate_id,
            "speaker_id": self.speaker_id,
            "content": self.content,
            "round": self.round,
            "emotional_tone": self.emotional_tone,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TrendingTopic(Base):
    __tablename__ = "trending_topics"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sim_id = Column(String(64), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False)
    hashtag = Column(String(128), nullable=False)
    count = Column(Integer, default=1)
    virality_score = Column(Float, default=0.0)
    phase = Column(String(32), default="social")
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_trending_sim", "sim_id"),
        Index("ix_trending_score", "sim_id", "virality_score"),
    )

    def to_dict(self):
        return {
            "hashtag": self.hashtag,
            "count": self.count,
            "virality_score": self.virality_score,
            "phase": self.phase,
        }
