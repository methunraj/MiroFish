"""
Activity logger – appends agent activities to a JSONL file.
Storage: uploads/workbench/agents/{id}/activities.jsonl
"""

import os
import json
import uuid
import threading
from datetime import datetime
from typing import Dict, Any, List, Optional

from ...models.workbench import WorkbenchStore


class ActivityLogger:
    """Thread-safe JSONL logger for a single agent."""

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self._lock = threading.Lock()
        agent_dir = WorkbenchStore.agent_dir(agent_id)
        os.makedirs(agent_dir, exist_ok=True)
        self._path = os.path.join(agent_dir, "activities.jsonl")

    def log(
        self,
        activity_type: str,
        agent_name: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        activity = {
            "id": uuid.uuid4().hex[:16],
            "type": activity_type,
            "agent_name": agent_name,
            "content": content,
            "timestamp": datetime.now().isoformat(),
            "metadata": metadata or {},
        }
        with self._lock:
            try:
                with open(self._path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(activity, ensure_ascii=False) + "\n")
            except Exception:
                pass
        return activity

    def get_activities(self, from_line: int = 0) -> List[Dict[str, Any]]:
        activities: List[Dict[str, Any]] = []
        if not os.path.exists(self._path):
            return activities
        try:
            with open(self._path, "r", encoding="utf-8") as f:
                for idx, line in enumerate(f):
                    if idx < from_line:
                        continue
                    line = line.strip()
                    if line:
                        activities.append(json.loads(line))
        except Exception:
            pass
        return activities

    def get_count(self) -> int:
        if not os.path.exists(self._path):
            return 0
        try:
            with open(self._path, "r", encoding="utf-8") as f:
                return sum(1 for line in f if line.strip())
        except Exception:
            return 0
