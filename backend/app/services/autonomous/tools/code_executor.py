"""
Code executor tool – runs Python code in a subprocess with timeout.
Each agent gets a scoped working directory.
"""

import os
import subprocess
import tempfile
from typing import Dict, Any

from ....models.workbench import WorkbenchStore


class CodeExecutor:
    TIMEOUT = 30
    MAX_OUTPUT = 10_000

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self._workdir = WorkbenchStore.agent_files_dir(agent_id)

    def execute(self, code: str, language: str = "python") -> Dict[str, Any]:
        if not code.strip():
            return {"error": "No code provided"}
        if language != "python":
            return {"error": f"Unsupported language: {language}. Only 'python' is supported."}

        try:
            fd, script_path = tempfile.mkstemp(suffix=".py", dir=self._workdir)
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    f.write(code)

                result = subprocess.run(
                    ["python", script_path],
                    capture_output=True,
                    text=True,
                    timeout=self.TIMEOUT,
                    cwd=self._workdir,
                    env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                )
                stdout = result.stdout
                stderr = result.stderr
                if len(stdout) > self.MAX_OUTPUT:
                    stdout = stdout[: self.MAX_OUTPUT] + "\n...[truncated]"
                if len(stderr) > self.MAX_OUTPUT:
                    stderr = stderr[: self.MAX_OUTPUT] + "\n...[truncated]"

                return {
                    "stdout": stdout,
                    "stderr": stderr,
                    "exit_code": result.returncode,
                }
            finally:
                try:
                    os.unlink(script_path)
                except OSError:
                    pass
        except subprocess.TimeoutExpired:
            return {"error": f"Execution timed out after {self.TIMEOUT}s", "exit_code": -1}
        except Exception as e:
            return {"error": str(e), "exit_code": -1}
