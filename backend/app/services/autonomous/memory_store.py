"""
Memory store – simple JSON-based storage for agent memory.
Storage: uploads/workbench/agents/{id}/memory.json
Provides keyword-based search (upgradeable to pgvector later).
"""

import os
import json
import threading
from datetime import datetime
from typing import Dict, Any, List, Optional

from ...models.workbench import WorkbenchStore


class MemoryStore:
    """Thread-safe JSON memory for a single agent."""

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self._lock = threading.Lock()
        agent_dir = WorkbenchStore.agent_dir(agent_id)
        os.makedirs(agent_dir, exist_ok=True)
        self._path = os.path.join(agent_dir, "memory.json")
        self._memories: List[Dict[str, Any]] = self._load()

    def _load(self) -> List[Dict[str, Any]]:
        if not os.path.exists(self._path):
            return []
        try:
            with open(self._path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except Exception:
            return []

    def _save(self) -> None:
        try:
            with open(self._path, "w", encoding="utf-8") as f:
                json.dump(self._memories, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def store(self, key: str, content: str, embedding_text: Optional[str] = None) -> None:
        entry = {
            "key": key,
            "content": content,
            "embedding_text": embedding_text or content,
            "timestamp": datetime.now().isoformat(),
        }
        with self._lock:
            self._memories.append(entry)
            self._save()

    def search(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Keyword-based search across memory entries."""
        query_lower = query.lower()
        tokens = query_lower.split()
        with self._lock:
            scored: List[tuple] = []
            for mem in self._memories:
                text = (mem.get("content", "") + " " + mem.get("embedding_text", "")).lower()
                score = sum(1 for t in tokens if t in text)
                if score > 0:
                    scored.append((score, mem))
            scored.sort(key=lambda x: x[0], reverse=True)
            return [m for _, m in scored[:limit]]

    def get_recent(self, limit: int = 10) -> List[Dict[str, Any]]:
        with self._lock:
            return list(reversed(self._memories[-limit:]))

    def get_size(self) -> int:
        with self._lock:
            return len(self._memories)

    def clear(self) -> None:
        with self._lock:
            self._memories = []
            self._save()
