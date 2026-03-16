"""
LLM-based entity and relationship extractor
Replaces Zep Cloud's automatic AI entity extraction with local LLM calls
"""

import json
from typing import Dict, Any, List, Optional

from ..utils.logger import get_logger
from ..utils.llm_client import LLMClient
from .graph_store import GraphStore

logger = get_logger('mirofish.entity_extractor')


class EntityExtractor:
    """
    Extracts entities and relationships from text using LLM.
    Replaces Zep Cloud's automatic entity extraction.
    """

    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm = llm_client or LLMClient()
        self.store = GraphStore()

    def extract_from_episode(self, episode_uuid: str, graph_id: str):
        """
        Extract entities and relationships from a single episode.

        Args:
            episode_uuid: Episode UUID
            graph_id: Graph ID
        """
        try:
            # Get the episode content
            pending = self.store.get_pending_episodes(graph_id)
            episode = next((ep for ep in pending if ep["uuid"] == episode_uuid), None)
            if not episode:
                logger.warning(f"Episode {episode_uuid} not found or already processed")
                return

            # Get ontology for structured extraction
            ontology = self.store.get_ontology(graph_id) or {}
            entity_types = [et.get("name", "") for et in ontology.get("entity_types", [])]
            edge_types = [et.get("name", "") for et in ontology.get("edge_types", [])]

            # Build extraction prompt
            prompt = self._build_prompt(episode["content"], entity_types, edge_types)

            # Call LLM
            response = self.llm.chat_json(
                messages=[
                    {"role": "system", "content": "你是一个知识图谱实体和关系提取专家。从文本中精确提取实体和关系，返回纯JSON格式。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
            )

            # Parse and store results
            entities = response.get("entities", [])
            relationships = response.get("relationships", [])

            # Store entities (deduplicate by name + type within graph)
            node_uuid_map = {}
            for entity in entities:
                name = entity.get("name", "").strip()
                etype = entity.get("type", "").strip()
                if not name:
                    continue

                # Check if node already exists
                existing = self.store.find_node_by_name(graph_id, name, etype if etype else None)
                if existing:
                    node_uuid_map[f"{name}:{etype}"] = existing["uuid"]
                    # Optionally merge/update summary
                    if entity.get("summary") and not existing.get("summary"):
                        self.store.update_node(existing["uuid"], summary=entity["summary"])
                    continue

                # Create new node
                labels = ["Entity"]
                if etype:
                    labels.append(etype)
                node_uuid = self.store.add_node(
                    graph_id=graph_id,
                    name=name,
                    labels=labels,
                    summary=entity.get("summary", ""),
                    attributes=entity.get("attributes", {})
                )
                node_uuid_map[f"{name}:{etype}"] = node_uuid

            # Store relationships
            for rel in relationships:
                source_name = rel.get("source", "").strip()
                target_name = rel.get("target", "").strip()
                rel_type = rel.get("type", rel.get("relation", "")).strip()
                fact = rel.get("fact", rel.get("description", "")).strip()

                if not source_name or not target_name:
                    continue

                # Find source and target nodes
                source_key = f"{source_name}:"
                target_key = f"{target_name}:"
                source_uuid = None
                target_uuid = None

                # Try to find with type
                source_type = rel.get("source_type", "")
                target_type = rel.get("target_type", "")
                if source_type:
                    source_key = f"{source_name}:{source_type}"
                if target_type:
                    target_key = f"{target_name}:{target_type}"

                if source_key in node_uuid_map:
                    source_uuid = node_uuid_map[source_key]
                else:
                    # Try to find by name
                    existing = self.store.find_node_by_name(graph_id, source_name)
                    if existing:
                        source_uuid = existing["uuid"]
                    else:
                        # Auto-create node if referenced in relationship
                        source_uuid = self.store.add_node(
                            graph_id=graph_id,
                            name=source_name,
                            labels=["Entity"],
                            summary="",
                        )

                if target_key in node_uuid_map:
                    target_uuid = node_uuid_map[target_key]
                else:
                    existing = self.store.find_node_by_name(graph_id, target_name)
                    if existing:
                        target_uuid = existing["uuid"]
                    else:
                        target_uuid = self.store.add_node(
                            graph_id=graph_id,
                            name=target_name,
                            labels=["Entity"],
                            summary="",
                        )

                self.store.add_edge(
                    graph_id=graph_id,
                    name=rel_type or "RELATED_TO",
                    fact=fact,
                    source_node_uuid=source_uuid,
                    target_node_uuid=target_uuid,
                    attributes=rel.get("attributes", {})
                )

            logger.info(
                f"Episode {episode_uuid[:8]}: extracted {len(entities)} entities, "
                f"{len(relationships)} relationships"
            )

            # Mark episode as processed
            self.store.mark_episode_processed(episode_uuid)

        except Exception as e:
            logger.error(f"Entity extraction failed for episode {episode_uuid}: {e}")
            self.store.mark_episode_processed(episode_uuid, error=str(e))

    def extract_from_text(self, text: str, graph_id: str, ontology: Optional[Dict] = None):
        """
        Extract entities directly from text (without episode).

        Args:
            text: Text to extract from
            graph_id: Graph ID
            ontology: Optional ontology dict
        """
        if ontology is None:
            ontology = self.store.get_ontology(graph_id) or {}

        entity_types = [et.get("name", "") for et in ontology.get("entity_types", [])]
        edge_types = [et.get("name", "") for et in ontology.get("edge_types", [])]

        prompt = self._build_prompt(text, entity_types, edge_types)

        response = self.llm.chat_json(
            messages=[
                {"role": "system", "content": "你是一个知识图谱实体和关系提取专家。从文本中精确提取实体和关系，返回纯JSON格式。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
        )

        entities = response.get("entities", [])
        relationships = response.get("relationships", [])

        node_uuid_map = {}
        for entity in entities:
            name = entity.get("name", "").strip()
            etype = entity.get("type", "").strip()
            if not name:
                continue

            existing = self.store.find_node_by_name(graph_id, name, etype or None)
            if existing:
                node_uuid_map[f"{name}:{etype}"] = existing["uuid"]
                continue

            labels = ["Entity"]
            if etype:
                labels.append(etype)
            node_uuid = self.store.add_node(
                graph_id=graph_id,
                name=name,
                labels=labels,
                summary=entity.get("summary", ""),
                attributes=entity.get("attributes", {})
            )
            node_uuid_map[f"{name}:{etype}"] = node_uuid

        for rel in relationships:
            source_name = rel.get("source", "").strip()
            target_name = rel.get("target", "").strip()
            rel_type = rel.get("type", rel.get("relation", "")).strip()
            fact = rel.get("fact", rel.get("description", "")).strip()

            if not source_name or not target_name:
                continue

            source_type = rel.get("source_type", "")
            target_type = rel.get("target_type", "")
            source_uuid = node_uuid_map.get(f"{source_name}:{source_type}") or node_uuid_map.get(f"{source_name}:")
            target_uuid = node_uuid_map.get(f"{target_name}:{target_type}") or node_uuid_map.get(f"{target_name}:")

            if source_uuid and target_uuid:
                self.store.add_edge(
                    graph_id=graph_id,
                    name=rel_type or "RELATED_TO",
                    fact=fact,
                    source_node_uuid=source_uuid,
                    target_node_uuid=target_uuid,
                    attributes=rel.get("attributes", {})
                )

        logger.info(f"Extracted {len(entities)} entities, {len(relationships)} relationships")
        return len(entities), len(relationships)

    def _build_prompt(self, text: str, entity_types: List[str], edge_types: List[str]) -> str:
        """Build extraction prompt"""
        type_hint = ""
        if entity_types:
            type_hint += f"\n已定义的实体类型: {', '.join(entity_types)}"
        if edge_types:
            type_hint += f"\n已定义的关系类型: {', '.join(edge_types)}"

        return f"""请从以下文本中提取所有实体和它们之间的关系。

{type_hint}

## 文本内容
{text}

## 输出要求
请返回JSON格式（不要markdown代码块）：
{{
    "entities": [
        {{
            "name": "实体名称",
            "type": "实体类型",
            "summary": "实体简要描述",
            "attributes": {{}}
        }}
    ],
    "relationships": [
        {{
            "source": "源实体名称",
            "target": "目标实体名称",
            "source_type": "源实体类型（可选）",
            "target_type": "目标实体类型（可选）",
            "type": "关系类型",
            "fact": "关系事实描述",
            "attributes": {{}}
        }}
    ]
}}

注意：
1. 实体名称必须是文本中出现的原始名称，不要编造
2. type字段如果匹配已定义的类型就使用，否则自行判断合适的类型
3. 每个关系必须有明确的source和target
4. fact字段应该是一个完整的事实描述句"""
