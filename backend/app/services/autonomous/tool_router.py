"""
Tool router – registry and dispatch for autonomous agent tools.
"""

from typing import Dict, Any, List, Optional

from .tools.web_browser import WebBrowser
from .tools.code_executor import CodeExecutor
from .tools.file_manager import FileManager
from .tools.api_client import APIClient
from .tools.web_search import WebSearch
from .tools.message_bus import MessageBus


TOOL_REGISTRY: List[Dict[str, Any]] = [
    {
        "name": "web_browser",
        "description": "Navigate to a URL and extract page content (title, text, links).",
        "parameters": {
            "url": {"type": "string", "description": "The URL to navigate to", "required": True},
        },
    },
    {
        "name": "code_executor",
        "description": "Execute Python code and return stdout/stderr.",
        "parameters": {
            "code": {"type": "string", "description": "Python code to execute", "required": True},
            "language": {"type": "string", "description": "Language (only 'python' supported)", "required": False},
        },
    },
    {
        "name": "file_manager",
        "description": "Read, write, list, or delete files in the agent's workspace.",
        "parameters": {
            "action": {"type": "string", "description": "One of: write_file, read_file, list_files, delete_file", "required": True},
            "path": {"type": "string", "description": "Relative file path (for write/read/delete)", "required": False},
            "content": {"type": "string", "description": "File content (for write_file)", "required": False},
        },
    },
    {
        "name": "api_client",
        "description": "Make HTTP requests to external APIs.",
        "parameters": {
            "method": {"type": "string", "description": "HTTP method (GET, POST, PUT, DELETE)", "required": True},
            "url": {"type": "string", "description": "Request URL", "required": True},
            "headers": {"type": "object", "description": "Optional request headers", "required": False},
            "body": {"type": "object", "description": "Optional request body", "required": False},
        },
    },
    {
        "name": "web_search",
        "description": "Search the web using DuckDuckGo and return results.",
        "parameters": {
            "query": {"type": "string", "description": "Search query", "required": True},
            "num_results": {"type": "integer", "description": "Number of results (default 5)", "required": False},
        },
    },
    {
        "name": "message_bus",
        "description": "Send or receive messages to/from other agents.",
        "parameters": {
            "action": {"type": "string", "description": "One of: send, receive, clear", "required": True},
            "to_id": {"type": "string", "description": "Target agent id (for send)", "required": False},
            "content": {"type": "string", "description": "Message content (for send)", "required": False},
        },
    },
]


class ToolRouter:
    """Routes tool calls to the appropriate implementation."""

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self._web_browser = WebBrowser()
        self._code_executor = CodeExecutor(agent_id)
        self._file_manager = FileManager(agent_id)
        self._api_client = APIClient()
        self._web_search = WebSearch()
        self._message_bus = MessageBus()

    def route(self, tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            if tool_name == "web_browser":
                return self._web_browser.navigate(params.get("url", ""))
            elif tool_name == "code_executor":
                return self._code_executor.execute(
                    params.get("code", ""),
                    language=params.get("language", "python"),
                )
            elif tool_name == "file_manager":
                return self._route_file_manager(params)
            elif tool_name == "api_client":
                return self._api_client.request(
                    method=params.get("method", "GET"),
                    url=params.get("url", ""),
                    headers=params.get("headers"),
                    body=params.get("body"),
                )
            elif tool_name == "web_search":
                return self._web_search.search(
                    query=params.get("query", ""),
                    num_results=params.get("num_results", 5),
                )
            elif tool_name == "message_bus":
                return self._route_message_bus(params)
            else:
                return {"error": f"Unknown tool: {tool_name}"}
        except Exception as e:
            return {"error": str(e)}

    def _route_file_manager(self, params: Dict[str, Any]) -> Dict[str, Any]:
        action = params.get("action", "")
        path = params.get("path", "")
        content = params.get("content", "")
        if action == "write_file":
            return self._file_manager.write_file(path, content)
        elif action == "read_file":
            return self._file_manager.read_file(path)
        elif action == "list_files":
            return self._file_manager.list_files()
        elif action == "delete_file":
            return self._file_manager.delete_file(path)
        return {"error": f"Unknown file_manager action: {action}"}

    def _route_message_bus(self, params: Dict[str, Any]) -> Dict[str, Any]:
        action = params.get("action", "")
        if action == "send":
            return self._message_bus.send(
                from_id=self.agent_id,
                to_id=params.get("to_id", ""),
                content=params.get("content", ""),
            )
        elif action == "receive":
            return self._message_bus.receive(self.agent_id)
        elif action == "clear":
            return self._message_bus.clear(self.agent_id)
        return {"error": f"Unknown message_bus action: {action}"}

    @staticmethod
    def list_tools(filter_names: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        if filter_names is None:
            return TOOL_REGISTRY
        return [t for t in TOOL_REGISTRY if t["name"] in filter_names]
