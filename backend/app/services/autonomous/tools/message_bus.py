"""
Message bus – file-based message queue for inter-agent communication.
Storage: uploads/workbench/messages/{to_id}.jsonl
"""

import os
import json
import uuid
import threading
from datetime import datetime
from typing import Dict, Any, List

from ....models.workbench import WorkbenchStore


class MessageBus:
    _lock = threading.Lock()

    @staticmethod
    def _msg_path(agent_id: str) -> str:
        msg_dir = WorkbenchStore.MESSAGES_DIR
        os.makedirs(msg_dir, exist_ok=True)
        return os.path.join(msg_dir, f"{agent_id}.jsonl")

    def send(self, from_id: str, to_id: str, content: str) -> Dict[str, Any]:
        if not to_id:
            return {"error": "No target agent id provided"}
        if not content:
            return {"error": "No message content provided"}

        message = {
            "id": uuid.uuid4().hex[:16],
            "from_id": from_id,
            "to_id": to_id,
            "content": content,
            "timestamp": datetime.now().isoformat(),
        }
        try:
            with self._lock:
                path = self._msg_path(to_id)
                with open(path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(message, ensure_ascii=False) + "\n")
            return {"status": "sent", "message_id": message["id"]}
        except Exception as e:
            return {"error": str(e)}

    def receive(self, agent_id: str) -> Dict[str, Any]:
        try:
            path = self._msg_path(agent_id)
            messages: List[Dict[str, Any]] = []
            if not os.path.exists(path):
                return {"messages": messages}
            with self._lock:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            messages.append(json.loads(line))
            return {"messages": messages}
        except Exception as e:
            return {"error": str(e)}

    def clear(self, agent_id: str) -> Dict[str, Any]:
        try:
            path = self._msg_path(agent_id)
            with self._lock:
                if os.path.exists(path):
                    os.remove(path)
            return {"status": "cleared"}
        except Exception as e:
            return {"error": str(e)}
