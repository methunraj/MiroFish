"""
图谱数据统一访问层
Unified data access layer for graph storage, replacing all Zep Cloud API calls
"""

import uuid
from typing import Dict, Any, List, Optional
from contextlib import contextmanager

from sqlalchemy import text

from ..models.graph_db import (
    Graph, Node, Edge, Episode, Base,
    get_db_session, init_db
)
from ..utils.logger import get_logger

logger = get_logger('mirofish.graph_store')


class GraphStore:
    """
    Unified graph data access layer.
    Replaces all Zep Cloud API calls with local PostgreSQL operations.
    """

    def __init__(self):
        pass

    # ========== Graph Lifecycle ==========

    def create_graph(self, graph_id: str, name: str, description: str = "") -> str:
        """Create a new graph"""
        with self._session() as session:
            graph = Graph(
                graph_id=graph_id,
                name=name,
                description=description or "MiroFish Social Simulation Graph"
            )
            session.add(graph)
            session.commit()
        logger.info(f"Created graph: {graph_id}")
        return graph_id

    def delete_graph(self, graph_id: str):
        """Delete a graph and all associated data"""
        with self._session() as session:
            graph = session.query(Graph).filter_by(graph_id=graph_id).first()
            if graph:
                session.delete(graph)
                session.commit()
                logger.info(f"Deleted graph: {graph_id}")
            else:
                logger.warning(f"Graph not found for deletion: {graph_id}")

    def set_ontology(self, graph_id: str, ontology: Dict[str, Any]):
        """Store ontology as JSONB"""
        with self._session() as session:
            graph = session.query(Graph).filter_by(graph_id=graph_id).first()
            if graph:
                graph.ontology = ontology
                session.commit()
                logger.info(f"Set ontology for graph: {graph_id}")
            else:
                raise ValueError(f"Graph not found: {graph_id}")

    def get_ontology(self, graph_id: str) -> Optional[Dict[str, Any]]:
        """Get ontology for a graph"""
        with self._session() as session:
            graph = session.query(Graph).filter_by(graph_id=graph_id).first()
            return graph.ontology if graph else None

    # ========== Episode Management ==========

    def add_episode(self, graph_id: str, content: str, episode_type: str = "text") -> str:
        """Add a single episode, returns UUID"""
        ep_uuid = uuid.uuid4()
        with self._session() as session:
            episode = Episode(
                uuid=ep_uuid,
                graph_id=graph_id,
                content=content,
                type=episode_type
            )
            session.add(episode)
            session.commit()
        return str(ep_uuid)

    def add_episode_batch(self, graph_id: str, contents: List[str], episode_type: str = "text") -> List[str]:
        """Add multiple episodes, returns list of UUIDs"""
        ep_uuids = []
        with self._session() as session:
            for content in contents:
                ep_uuid = uuid.uuid4()
                episode = Episode(
                    uuid=ep_uuid,
                    graph_id=graph_id,
                    content=content,
                    type=episode_type
                )
                session.add(episode)
                ep_uuids.append(str(ep_uuid))
            session.commit()
        return ep_uuids

    def mark_episode_processed(self, episode_uuid: str, error: Optional[str] = None):
        """Mark an episode as processed (or failed)"""
        with self._session() as session:
            episode = session.query(Episode).filter_by(uuid=uuid.UUID(episode_uuid)).first()
            if episode:
                episode.processed = True
                episode.error = error
                session.commit()

    def get_pending_episodes(self, graph_id: str) -> List[Dict[str, Any]]:
        """Get all unprocessed episodes for a graph"""
        with self._session() as session:
            episodes = session.query(Episode).filter_by(
                graph_id=graph_id, processed=False
            ).order_by(Episode.created_at).all()
            return [
                {"uuid": str(ep.uuid), "content": ep.content, "type": ep.type}
                for ep in episodes
            ]

    # ========== Node CRUD ==========

    def add_node(
        self,
        graph_id: str,
        name: str,
        labels: Optional[List[str]] = None,
        summary: str = "",
        attributes: Optional[Dict[str, Any]] = None
    ) -> str:
        """Add a node, returns UUID"""
        node_uuid = uuid.uuid4()
        with self._session() as session:
            node = Node(
                uuid=node_uuid,
                graph_id=graph_id,
                name=name,
                labels=labels or [],
                summary=summary,
                attributes=attributes or {}
            )
            session.add(node)
            session.commit()
        return str(node_uuid)

    def get_node(self, node_uuid: str) -> Optional[Dict[str, Any]]:
        """Get a single node by UUID"""
        with self._session() as session:
            node = session.query(Node).filter_by(uuid=uuid.UUID(node_uuid)).first()
            if not node:
                return None
            return {
                "uuid": str(node.uuid),
                "name": node.name,
                "labels": node.labels or [],
                "summary": node.summary or "",
                "attributes": node.attributes or {},
                "created_at": str(node.created_at) if node.created_at else None,
            }

    def find_node_by_name(self, graph_id: str, name: str, label: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Find a node by name (and optionally label) within a graph. Used for deduplication."""
        with self._session() as session:
            query = session.query(Node).filter_by(graph_id=graph_id, name=name)
            if label:
                query = query.filter(Node.labels.any(label))
            node = query.first()
            if not node:
                return None
            return {
                "uuid": str(node.uuid),
                "name": node.name,
                "labels": node.labels or [],
                "summary": node.summary or "",
                "attributes": node.attributes or {},
                "created_at": str(node.created_at) if node.created_at else None,
            }

    def update_node(self, node_uuid: str, summary: Optional[str] = None, attributes: Optional[Dict] = None):
        """Update a node's summary and/or attributes"""
        with self._session() as session:
            node = session.query(Node).filter_by(uuid=uuid.UUID(node_uuid)).first()
            if node:
                if summary is not None:
                    node.summary = summary
                if attributes is not None:
                    node.attributes = attributes
                session.commit()

    def get_all_nodes(self, graph_id: str, limit: int = 2000, offset: int = 0) -> List[Dict[str, Any]]:
        """Get all nodes for a graph (with pagination)"""
        with self._session() as session:
            nodes = session.query(Node).filter_by(
                graph_id=graph_id
            ).order_by(Node.created_at).offset(offset).limit(limit).all()
            return [
                {
                    "uuid": str(n.uuid),
                    "name": n.name,
                    "labels": n.labels or [],
                    "summary": n.summary or "",
                    "attributes": n.attributes or {},
                    "created_at": str(n.created_at) if n.created_at else None,
                }
                for n in nodes
            ]

    def get_node_edges(self, node_uuid: str) -> List[Dict[str, Any]]:
        """Get all edges connected to a node"""
        with self._session() as session:
            nid = uuid.UUID(node_uuid)
            edges = session.query(Edge).filter(
                (Edge.source_node_uuid == nid) | (Edge.target_node_uuid == nid)
            ).all()
            return [self._edge_to_dict(e) for e in edges]

    # ========== Edge CRUD ==========

    def add_edge(
        self,
        graph_id: str,
        name: str,
        fact: str,
        source_node_uuid: str,
        target_node_uuid: str,
        attributes: Optional[Dict[str, Any]] = None
    ) -> str:
        """Add an edge, returns UUID"""
        edge_uuid = uuid.uuid4()
        with self._session() as session:
            edge = Edge(
                uuid=edge_uuid,
                graph_id=graph_id,
                name=name,
                fact=fact,
                source_node_uuid=uuid.UUID(source_node_uuid) if source_node_uuid else None,
                target_node_uuid=uuid.UUID(target_node_uuid) if target_node_uuid else None,
                attributes=attributes or {}
            )
            session.add(edge)
            session.commit()
        return str(edge_uuid)

    def get_all_edges(self, graph_id: str, limit: int = 5000, offset: int = 0) -> List[Dict[str, Any]]:
        """Get all edges for a graph (with pagination)"""
        with self._session() as session:
            edges = session.query(Edge).filter_by(
                graph_id=graph_id
            ).order_by(Edge.created_at).offset(offset).limit(limit).all()
            return [self._edge_to_dict(e) for e in edges]

    # ========== Search ==========

    def search(
        self,
        graph_id: str,
        query: str,
        limit: int = 10,
        scope: str = "edges"
    ) -> Dict[str, Any]:
        """
        Full-text search using PostgreSQL tsvector/ts_rank.
        Searches both edge facts and node names/summaries.
        """
        facts = []
        edges = []
        nodes = []

        query_lower = query.lower()
        keywords = [w.strip() for w in query_lower.replace(',', ' ').replace('，', ' ').split() if len(w.strip()) > 1]

        with self._session() as session:
            if scope in ("edges", "both"):
                # Search edge facts using ILIKE (case-insensitive)
                edge_results = session.query(Edge).filter(
                    Edge.graph_id == graph_id,
                    Edge.fact.ilike(f'%{query}%')
                ).limit(limit).all()
                for e in edge_results:
                    facts.append(e.fact)
                    edges.append({
                        "uuid": str(e.uuid),
                        "name": e.name,
                        "fact": e.fact,
                        "source_node_uuid": str(e.source_node_uuid) if e.source_node_uuid else '',
                        "target_node_uuid": str(e.target_node_uuid) if e.target_node_uuid else '',
                    })

            if scope in ("nodes", "both"):
                # Search node names and summaries
                node_results = session.query(Node).filter(
                    Node.graph_id == graph_id,
                    (Node.name.ilike(f'%{query}%') | Node.summary.ilike(f'%{query}%'))
                ).limit(limit).all()
                for n in node_results:
                    nodes.append({
                        "uuid": str(n.uuid),
                        "name": n.name,
                        "labels": n.labels or [],
                        "summary": n.summary or "",
                    })
                    if n.summary:
                        facts.append(f"[{n.name}]: {n.summary}")

        return {
            "facts": facts[:limit],
            "edges": edges[:limit],
            "nodes": nodes[:limit],
            "query": query,
            "total_count": len(facts)
        }

    # ========== Statistics ==========

    def get_graph_statistics(self, graph_id: str) -> Dict[str, Any]:
        """Get graph statistics"""
        with self._session() as session:
            node_count = session.query(Node).filter_by(graph_id=graph_id).count()
            edge_count = session.query(Edge).filter_by(graph_id=graph_id).count()
            episode_count = session.query(Episode).filter_by(graph_id=graph_id).count()
            processed_count = session.query(Episode).filter_by(
                graph_id=graph_id, processed=True
            ).count()

            graph = session.query(Graph).filter_by(graph_id=graph_id).first()
            ontology = graph.ontology if graph else {}

            # Entity type distribution
            entity_types = {}
            nodes = session.query(Node).filter_by(graph_id=graph_id).all()
            for n in nodes:
                for label in (n.labels or []):
                    if label not in ["Entity", "Node"]:
                        entity_types[label] = entity_types.get(label, 0) + 1

        return {
            "graph_id": graph_id,
            "node_count": node_count,
            "edge_count": edge_count,
            "episode_count": episode_count,
            "processed_count": processed_count,
            "pending_count": episode_count - processed_count,
            "entity_types": entity_types,
            "has_ontology": bool(ontology),
        }

    # ========== Helpers ==========

    @staticmethod
    def _edge_to_dict(e: Edge) -> Dict[str, Any]:
        """Convert an Edge ORM object to dict"""
        return {
            "uuid": str(e.uuid),
            "name": e.name or "",
            "fact": e.fact or "",
            "source_node_uuid": str(e.source_node_uuid) if e.source_node_uuid else '',
            "target_node_uuid": str(e.target_node_uuid) if e.target_node_uuid else '',
            "attributes": e.attributes or {},
            "created_at": str(e.created_at) if e.created_at else None,
            "valid_at": str(e.valid_at) if e.valid_at else None,
            "invalid_at": str(e.invalid_at) if e.invalid_at else None,
            "expired_at": str(e.expired_at) if e.expired_at else None,
        }

    @contextmanager
    def _session(self):
        """Session context manager shortcut"""
        with get_db_session() as session:
            yield session
