"""
图谱构建服务
使用本地 PostgreSQL + LLM 构建知识图谱
"""

import os
import uuid
import time
import threading
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass

from .graph_store import GraphStore
from .entity_extractor import EntityExtractor
from .extraction_worker import ExtractionWorker

from ..config import Config
from ..models.task import TaskManager, TaskStatus
from .text_processor import TextProcessor


@dataclass
class GraphInfo:
    """图谱信息"""
    graph_id: str
    node_count: int
    edge_count: int
    entity_types: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "graph_id": self.graph_id,
            "node_count": self.node_count,
            "edge_count": self.edge_count,
            "entity_types": self.entity_types,
        }


class GraphBuilderService:
    """
    图谱构建服务
    使用 GraphStore + EntityExtractor + ExtractionWorker 替代 Zep Cloud
    """

    def __init__(self):
        self.store = GraphStore()
        self.extractor = EntityExtractor()
        self.worker = ExtractionWorker()
        self.task_manager = TaskManager()

    def build_graph_async(
        self,
        text: str,
        ontology: Dict[str, Any],
        graph_name: str = "MiroFish Graph",
        chunk_size: int = 500,
        chunk_overlap: int = 50,
        batch_size: int = 3
    ) -> str:
        """
        异步构建图谱

        Args:
            text: 输入文本
            ontology: 本体定义（来自接口1的输出）
            graph_name: 图谱名称
            chunk_size: 文本块大小
            chunk_overlap: 块重叠大小
            batch_size: 每批发送的块数量

        Returns:
            任务ID
        """
        # 创建任务
        task_id = self.task_manager.create_task(
            task_type="graph_build",
            metadata={
                "graph_name": graph_name,
                "chunk_size": chunk_size,
                "text_length": len(text),
            }
        )

        # 在后台线程中执行构建
        thread = threading.Thread(
            target=self._build_graph_worker,
            args=(task_id, text, ontology, graph_name, chunk_size, chunk_overlap, batch_size)
        )
        thread.daemon = True
        thread.start()

        return task_id

    def _build_graph_worker(
        self,
        task_id: str,
        text: str,
        ontology: Dict[str, Any],
        graph_name: str,
        chunk_size: int,
        chunk_overlap: int,
        batch_size: int
    ):
        """图谱构建工作线程"""
        try:
            self.task_manager.update_task(
                task_id,
                status=TaskStatus.PROCESSING,
                progress=5,
                message="开始构建图谱..."
            )

            # 1. 创建图谱
            graph_id = self.create_graph(graph_name)
            self.task_manager.update_task(
                task_id,
                progress=10,
                message=f"图谱已创建: {graph_id}"
            )

            # 2. 设置本体
            self.set_ontology(graph_id, ontology)
            self.task_manager.update_task(
                task_id,
                progress=15,
                message="本体已设置"
            )

            # 3. 文本分块
            chunks = TextProcessor.split_text(text, chunk_size, chunk_overlap)
            total_chunks = len(chunks)
            self.task_manager.update_task(
                task_id,
                progress=20,
                message=f"文本已分割为 {total_chunks} 个块"
            )

            # 4. 分批添加文本
            self.add_text_batches(
                graph_id, chunks, batch_size,
                lambda msg, prog: self.task_manager.update_task(
                    task_id,
                    progress=20 + int(prog * 0.4),  # 20-60%
                    message=msg
                )
            )

            # 5. 通过LLM处理所有episodes
            self.task_manager.update_task(
                task_id,
                progress=60,
                message="通过LLM提取实体和关系..."
            )

            self.worker.wait_for_episodes(
                graph_id,
                lambda msg, prog: self.task_manager.update_task(
                    task_id,
                    progress=60 + int(prog * 0.3),  # 60-90%
                    message=msg
                )
            )

            # 6. 获取图谱信息
            self.task_manager.update_task(
                task_id,
                progress=90,
                message="获取图谱信息..."
            )

            graph_info = self._get_graph_info(graph_id)

            # 完成
            self.task_manager.complete_task(task_id, {
                "graph_id": graph_id,
                "graph_info": graph_info.to_dict(),
                "chunks_processed": total_chunks,
            })

        except Exception as e:
            import traceback
            error_msg = f"{str(e)}\n{traceback.format_exc()}"
            self.task_manager.fail_task(task_id, error_msg)

    def create_graph(self, name: str) -> str:
        """创建图谱"""
        graph_id = f"mirofish_{uuid.uuid4().hex[:16]}"
        self.store.create_graph(
            graph_id=graph_id,
            name=name,
            description="MiroFish Social Simulation Graph"
        )
        return graph_id

    def set_ontology(self, graph_id: str, ontology: Dict[str, Any]):
        """设置图谱本体"""
        self.store.set_ontology(graph_id, ontology)

    def add_text_batches(
        self,
        graph_id: str,
        chunks: List[str],
        batch_size: int = 3,
        progress_callback: Optional[Callable] = None
    ) -> List[str]:
        """分批添加文本到图谱，返回所有 episode 的 uuid 列表"""
        episode_uuids = []
        total_chunks = len(chunks)

        for i in range(0, total_chunks, batch_size):
            batch_chunks = chunks[i:i + batch_size]
            batch_num = i // batch_size + 1
            total_batches = (total_chunks + batch_size - 1) // batch_size

            if progress_callback:
                progress = (i + len(batch_chunks)) / total_chunks
                progress_callback(
                    f"添加第 {batch_num}/{total_batches} 批数据 ({len(batch_chunks)} 块)...",
                    progress
                )

            # 添加episodes到数据库
            uuids = self.store.add_episode_batch(graph_id, batch_chunks)
            episode_uuids.extend(uuids)

        return episode_uuids

    def _wait_for_episodes(
        self,
        graph_id: str,
        progress_callback: Optional[Callable] = None,
        timeout: int = 600
    ):
        """等待所有 episode 处理完成"""
        self.worker.wait_for_episodes(graph_id, progress_callback, timeout)

    def _get_graph_info(self, graph_id: str) -> GraphInfo:
        """获取图谱信息"""
        stats = self.store.get_graph_statistics(graph_id)

        return GraphInfo(
            graph_id=graph_id,
            node_count=stats["node_count"],
            edge_count=stats["edge_count"],
            entity_types=list(stats["entity_types"].keys())
        )

    def get_graph_data(self, graph_id: str) -> Dict[str, Any]:
        """
        获取完整图谱数据（包含详细信息）

        Args:
            graph_id: 图谱ID

        Returns:
            包含nodes和edges的字典
        """
        nodes = self.store.get_all_nodes(graph_id)
        edges = self.store.get_all_edges(graph_id)

        # 创建节点映射用于获取节点名称
        node_map = {}
        for node in nodes:
            node_map[node["uuid"]] = node["name"] or ""

        nodes_data = []
        for node in nodes:
            nodes_data.append({
                "uuid": node["uuid"],
                "name": node["name"],
                "labels": node["labels"] or [],
                "summary": node["summary"] or "",
                "attributes": node["attributes"] or {},
                "created_at": node.get("created_at"),
            })

        edges_data = []
        for edge in edges:
            edges_data.append({
                "uuid": edge["uuid"],
                "name": edge["name"] or "",
                "fact": edge["fact"] or "",
                "fact_type": edge["name"] or "",
                "source_node_uuid": edge["source_node_uuid"],
                "target_node_uuid": edge["target_node_uuid"],
                "source_node_name": node_map.get(edge["source_node_uuid"], ""),
                "target_node_name": node_map.get(edge["target_node_uuid"], ""),
                "attributes": edge.get("attributes") or {},
                "created_at": edge.get("created_at"),
                "valid_at": edge.get("valid_at"),
                "invalid_at": edge.get("invalid_at"),
                "expired_at": edge.get("expired_at"),
                "episodes": [],
            })

        return {
            "graph_id": graph_id,
            "nodes": nodes_data,
            "edges": edges_data,
            "node_count": len(nodes_data),
            "edge_count": len(edges_data),
        }

    def delete_graph(self, graph_id: str):
        """删除图谱"""
        self.store.delete_graph(graph_id)
