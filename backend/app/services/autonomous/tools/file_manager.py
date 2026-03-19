"""
File manager tool – scoped file operations within an agent's directory.
Prevents directory traversal attacks.
"""

import os
from typing import Dict, Any, List

from ....models.workbench import WorkbenchStore


class FileManager:
    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self._root = WorkbenchStore.agent_files_dir(agent_id)

    def _safe_path(self, relative_path: str) -> str:
        """Resolve path and ensure it stays within the agent's files directory."""
        cleaned = relative_path.lstrip("/").lstrip("\\")
        full = os.path.normpath(os.path.join(self._root, cleaned))
        if not full.startswith(os.path.normpath(self._root)):
            raise PermissionError("Path escapes agent workspace")
        return full

    def write_file(self, path: str, content: str) -> Dict[str, Any]:
        if not path:
            return {"error": "No path provided"}
        try:
            full = self._safe_path(path)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "w", encoding="utf-8") as f:
                f.write(content)
            return {"status": "ok", "path": path, "size": len(content)}
        except PermissionError as e:
            return {"error": str(e)}
        except Exception as e:
            return {"error": str(e)}

    def read_file(self, path: str) -> Dict[str, Any]:
        if not path:
            return {"error": "No path provided"}
        try:
            full = self._safe_path(path)
            if not os.path.exists(full):
                return {"error": f"File not found: {path}"}
            with open(full, "r", encoding="utf-8") as f:
                content = f.read()
            return {"path": path, "content": content, "size": len(content)}
        except PermissionError as e:
            return {"error": str(e)}
        except Exception as e:
            return {"error": str(e)}

    def list_files(self) -> Dict[str, Any]:
        try:
            files: List[Dict[str, Any]] = []
            for root, _dirs, filenames in os.walk(self._root):
                for fname in filenames:
                    full = os.path.join(root, fname)
                    rel = os.path.relpath(full, self._root)
                    files.append({
                        "path": rel,
                        "size": os.path.getsize(full),
                    })
            return {"files": files, "count": len(files)}
        except Exception as e:
            return {"error": str(e)}

    def delete_file(self, path: str) -> Dict[str, Any]:
        if not path:
            return {"error": "No path provided"}
        try:
            full = self._safe_path(path)
            if not os.path.exists(full):
                return {"error": f"File not found: {path}"}
            os.remove(full)
            return {"status": "ok", "path": path}
        except PermissionError as e:
            return {"error": str(e)}
        except Exception as e:
            return {"error": str(e)}
