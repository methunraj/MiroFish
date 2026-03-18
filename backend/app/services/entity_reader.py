"""
Entity reading and filtering service
Read nodes from graph and filter those matching predefined entity types
"""

import time
from typing import Dict, Any, List, Optional, Set, Callable, TypeVar
from dataclasses import dataclass, field

from .graph_store import GraphStore

from ..utils.logger import get_logger

logger = get_logger('parallelworld.entity_reader')

# For generic return types
T = TypeVar('T')


@dataclass
class EntityNode:
    """Entity node data structure"""
    uuid: str
    name: str
    labels: List[str]
    summary: str
    attributes: Dict[str, Any]
    # Related edge information
    related_edges: List[Dict[str, Any]] = field(default_factory=list)
    # Related node information
    related_nodes: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "uuid": self.uuid,
            "name": self.name,
            "labels": self.labels,
            "summary": self.summary,
            "attributes": self.attributes,
            "related_edges": self.related_edges,
            "related_nodes": self.related_nodes,
        }

    def get_entity_type(self) -> Optional[str]:
        """Get entity type (excluding default Entity label)"""
        for label in self.labels:
            if label not in ["Entity", "Node"]:
                return label
        return None


@dataclass
class FilteredEntities:
    """Filtered entity collection"""
    entities: List[EntityNode]
    entity_types: Set[str]
    total_count: int
    filtered_count: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entities": [e.to_dict() for e in self.entities],
            "entity_types": list(self.entity_types),
            "total_count": self.total_count,
            "filtered_count": self.filtered_count,
        }


class EntityReader:
    """
    Entity reading and filtering service

    Main functions:
    1. Read all nodes from the graph
    2. Filter nodes matching predefined entity types (nodes whose labels are not just "Entity")
    3. Get related edges and associated node information for each entity
    """

    def __init__(self):
        self.store = GraphStore()

    def get_all_nodes(self, graph_id: str) -> List[Dict[str, Any]]:
        """
        Get all nodes of a graph

        Args:
            graph_id: Graph ID

        Returns:
            Node list
        """
        logger.info(f"Getting all nodes of graph {graph_id}...")
        nodes_data = self.store.get_all_nodes(graph_id)
        logger.info(f"Retrieved {len(nodes_data)} nodes in total")
        return nodes_data

    def get_all_edges(self, graph_id: str) -> List[Dict[str, Any]]:
        """
        Get all edges of a graph

        Args:
            graph_id: Graph ID

        Returns:
            Edge list
        """
        logger.info(f"Getting all edges of graph {graph_id}...")
        edges_data = self.store.get_all_edges(graph_id)
        logger.info(f"Retrieved {len(edges_data)} edges in total")
        return edges_data

    def get_node_edges(self, node_uuid: str) -> List[Dict[str, Any]]:
        """
        Get all edges related to a specific node

        Args:
            node_uuid: Node UUID

        Returns:
            Edge list
        """
        try:
            return self.store.get_node_edges(node_uuid)
        except Exception as e:
            logger.warning(f"Failed to get edges for node {node_uuid}: {str(e)}")
            return []

    def filter_defined_entities(
        self,
        graph_id: str,
        defined_entity_types: Optional[List[str]] = None,
        enrich_with_edges: bool = True
    ) -> FilteredEntities:
        """
        Filter nodes matching predefined entity types

        Filtering logic:
        - If a node's labels only contain "Entity", it does not match our predefined types, skip it
        - If a node's labels contain tags other than "Entity" and "Node", it matches a predefined type, keep it

        Args:
            graph_id: Graph ID
            defined_entity_types: List of predefined entity types (optional; if provided, only these types are kept)
            enrich_with_edges: Whether to fetch related edge information for each entity

        Returns:
            FilteredEntities: Filtered entity collection
        """
        logger.info(f"Starting to filter entities for graph {graph_id}...")

        # Get all nodes
        all_nodes = self.get_all_nodes(graph_id)
        total_count = len(all_nodes)

        # Get all edges (for subsequent association lookup)
        all_edges = self.get_all_edges(graph_id) if enrich_with_edges else []

        # Build node UUID to node data mapping
        node_map = {n["uuid"]: n for n in all_nodes}

        # Filter entities matching the criteria
        filtered_entities = []
        entity_types_found = set()

        for node in all_nodes:
            labels = node.get("labels", [])

            # Filtering logic: Labels must contain tags other than "Entity" and "Node"
            custom_labels = [l for l in labels if l not in ["Entity", "Node"]]

            if not custom_labels:
                # Only default labels, skip
                continue

            # If predefined types are specified, check for match
            if defined_entity_types:
                matching_labels = [l for l in custom_labels if l in defined_entity_types]
                if not matching_labels:
                    continue
                entity_type = matching_labels[0]
            else:
                entity_type = custom_labels[0]

            entity_types_found.add(entity_type)

            # Create entity node object
            entity = EntityNode(
                uuid=node["uuid"],
                name=node["name"],
                labels=labels,
                summary=node["summary"],
                attributes=node["attributes"],
            )

            # Get related edges and nodes
            if enrich_with_edges:
                related_edges = []
                related_node_uuids = set()

                for edge in all_edges:
                    if edge["source_node_uuid"] == node["uuid"]:
                        related_edges.append({
                            "direction": "outgoing",
                            "edge_name": edge["name"],
                            "fact": edge["fact"],
                            "target_node_uuid": edge["target_node_uuid"],
                        })
                        related_node_uuids.add(edge["target_node_uuid"])
                    elif edge["target_node_uuid"] == node["uuid"]:
                        related_edges.append({
                            "direction": "incoming",
                            "edge_name": edge["name"],
                            "fact": edge["fact"],
                            "source_node_uuid": edge["source_node_uuid"],
                        })
                        related_node_uuids.add(edge["source_node_uuid"])

                entity.related_edges = related_edges

                # Get basic information of associated nodes
                related_nodes = []
                for related_uuid in related_node_uuids:
                    if related_uuid in node_map:
                        related_node = node_map[related_uuid]
                        related_nodes.append({
                            "uuid": related_node["uuid"],
                            "name": related_node["name"],
                            "labels": related_node["labels"],
                            "summary": related_node.get("summary", ""),
                        })

                entity.related_nodes = related_nodes

            filtered_entities.append(entity)

        logger.info(f"Filtering complete: total nodes {total_count}, matched {len(filtered_entities)}, "
                   f"entity types: {entity_types_found}")

        return FilteredEntities(
            entities=filtered_entities,
            entity_types=entity_types_found,
            total_count=total_count,
            filtered_count=len(filtered_entities),
        )

    def get_entity_with_context(
        self,
        graph_id: str,
        entity_uuid: str
    ) -> Optional[EntityNode]:
        """
        Get a single entity with its full context (edges and associated nodes)

        Args:
            graph_id: Graph ID
            entity_uuid: Entity UUID

        Returns:
            EntityNode or None
        """
        try:
            node = self.store.get_node(entity_uuid)

            if not node:
                return None

            # Get edges of the node
            edges = self.get_node_edges(entity_uuid)

            # Get all nodes for association lookup
            all_nodes = self.get_all_nodes(graph_id)
            node_map = {n["uuid"]: n for n in all_nodes}

            # Process related edges and nodes
            related_edges = []
            related_node_uuids = set()

            for edge in edges:
                if edge["source_node_uuid"] == entity_uuid:
                    related_edges.append({
                        "direction": "outgoing",
                        "edge_name": edge["name"],
                        "fact": edge["fact"],
                        "target_node_uuid": edge["target_node_uuid"],
                    })
                    related_node_uuids.add(edge["target_node_uuid"])
                else:
                    related_edges.append({
                        "direction": "incoming",
                        "edge_name": edge["name"],
                        "fact": edge["fact"],
                        "source_node_uuid": edge["source_node_uuid"],
                    })
                    related_node_uuids.add(edge["source_node_uuid"])

            # Get associated node information
            related_nodes = []
            for related_uuid in related_node_uuids:
                if related_uuid in node_map:
                    related_node = node_map[related_uuid]
                    related_nodes.append({
                        "uuid": related_node["uuid"],
                        "name": related_node["name"],
                        "labels": related_node["labels"],
                        "summary": related_node.get("summary", ""),
                    })

            return EntityNode(
                uuid=node["uuid"],
                name=node["name"],
                labels=node["labels"],
                summary=node["summary"],
                attributes=node["attributes"],
                related_edges=related_edges,
                related_nodes=related_nodes,
            )

        except Exception as e:
            logger.error(f"Failed to get entity {entity_uuid}: {str(e)}")
            return None

    def get_entities_by_type(
        self,
        graph_id: str,
        entity_type: str,
        enrich_with_edges: bool = True
    ) -> List[EntityNode]:
        """
        Get all entities of a specified type

        Args:
            graph_id: Graph ID
            entity_type: Entity type (e.g., "Student", "PublicFigure", etc.)
            enrich_with_edges: Whether to fetch related edge information

        Returns:
            Entity list
        """
        result = self.filter_defined_entities(
            graph_id=graph_id,
            defined_entity_types=[entity_type],
            enrich_with_edges=enrich_with_edges
        )
        return result.entities
