"""
Agent process – runs a ReACT (Reason + Act) loop in a background thread.
Each iteration: observe → think (LLM) → act (tool) → log → remember.
"""

import json
import threading
import traceback
from typing import Optional, List, Dict, Any

from ...utils.llm_client import LLMClient
from .activity_logger import ActivityLogger
from .memory_store import MemoryStore
from .tool_router import ToolRouter


MAX_ITERATIONS = 50


def _build_system_prompt(
    agent_name: str,
    role: str,
    goals: List[str],
    available_tools: List[Dict[str, Any]],
) -> str:
    tools_desc = "\n".join(
        f"  - {t['name']}: {t['description']}  params: {json.dumps(t['parameters'])}"
        for t in available_tools
    )
    goals_str = "\n".join(f"  {i+1}. {g}" for i, g in enumerate(goals))
    return f"""You are {agent_name}, an autonomous AI agent.
Role: {role}
Goals:
{goals_str}

Available tools:
{tools_desc}

You operate in a ReACT loop.  On every turn you MUST reply with valid JSON in exactly one of these forms:

Action form (use a tool):
{{
  "thought": "your reasoning",
  "action": {{
    "tool": "<tool_name>",
    "params": {{ ... }}
  }}
}}

Final answer form (task complete):
{{
  "thought": "your reasoning",
  "final_answer": "your final answer / summary"
}}

Rules:
- Always include "thought".
- Use tools to gather information or perform actions.
- When finished, return final_answer.
- Never output anything other than JSON.
"""


class AgentProcess:
    """Runs the ReACT loop for a single agent task."""

    def __init__(
        self,
        agent_id: str,
        agent_name: str,
        role: str,
        goals: List[str],
        task: str,
        tools: List[str],
        llm_client: LLMClient,
        activity_logger: ActivityLogger,
        memory_store: MemoryStore,
        tool_router: ToolRouter,
    ):
        self.agent_id = agent_id
        self.agent_name = agent_name
        self.role = role
        self.goals = goals
        self.task = task
        self.tools = tools
        self.llm_client = llm_client
        self.activity_logger = activity_logger
        self.memory_store = memory_store
        self.tool_router = tool_router

        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._iteration = 0
        self._status = "idle"
        self._final_answer: Optional[str] = None
        self._error: Optional[str] = None

    # ── Public API ──────────────────────────────────────────────

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._status = "running"
        self._iteration = 0
        self._final_answer = None
        self._error = None
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._status = "stopped"

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def get_state(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "status": self._status,
            "iteration": self._iteration,
            "is_running": self.is_running(),
            "final_answer": self._final_answer,
            "error": self._error,
        }

    # ── Main loop ───────────────────────────────────────────────

    def _run(self) -> None:
        available_tools = ToolRouter.list_tools(self.tools if self.tools else None)
        system_prompt = _build_system_prompt(
            self.agent_name, self.role, self.goals, available_tools,
        )

        conversation: List[Dict[str, str]] = [
            {"role": "system", "content": system_prompt},
        ]

        initial_context = self._observe()
        conversation.append({
            "role": "user",
            "content": f"Task: {self.task}\n\nContext:\n{initial_context}",
        })

        self.activity_logger.log("start", self.agent_name, f"Starting task: {self.task}")

        try:
            while self._iteration < MAX_ITERATIONS and not self._stop_event.is_set():
                self._iteration += 1

                # ── Think ──
                try:
                    llm_response = self.llm_client.chat_json(
                        messages=conversation, temperature=0.3, max_tokens=4096,
                    )
                except Exception as e:
                    self._error = f"LLM call failed: {e}"
                    self.activity_logger.log("error", self.agent_name, self._error)
                    self._status = "error"
                    return

                thought = llm_response.get("thought", "")
                self.activity_logger.log(
                    "thought", self.agent_name, thought,
                    metadata={"iteration": self._iteration},
                )

                # ── Check for final answer ──
                if "final_answer" in llm_response:
                    self._final_answer = llm_response["final_answer"]
                    self.activity_logger.log(
                        "final_answer", self.agent_name, self._final_answer,
                    )
                    self.memory_store.store(
                        key=f"task_result",
                        content=self._final_answer,
                        embedding_text=f"{self.task} {self._final_answer}",
                    )
                    self._status = "completed"
                    return

                # ── Act ──
                action = llm_response.get("action")
                if not action or "tool" not in action:
                    conversation.append({"role": "assistant", "content": json.dumps(llm_response)})
                    conversation.append({
                        "role": "user",
                        "content": "Your response must include either an 'action' with 'tool' and 'params', or a 'final_answer'. Please try again.",
                    })
                    continue

                tool_name = action["tool"]
                tool_params = action.get("params", {})

                self.activity_logger.log(
                    "action", self.agent_name,
                    f"Using tool: {tool_name}",
                    metadata={"tool": tool_name, "params": tool_params, "iteration": self._iteration},
                )

                tool_result = self.tool_router.route(tool_name, tool_params)

                self.activity_logger.log(
                    "observation", self.agent_name,
                    f"Tool result from {tool_name}",
                    metadata={"result_preview": _truncate(json.dumps(tool_result, ensure_ascii=False), 500)},
                )

                self.memory_store.store(
                    key=f"iter_{self._iteration}_{tool_name}",
                    content=_truncate(json.dumps(tool_result, ensure_ascii=False), 2000),
                    embedding_text=f"{tool_name} {thought}",
                )

                conversation.append({"role": "assistant", "content": json.dumps(llm_response)})
                conversation.append({
                    "role": "user",
                    "content": f"Tool result:\n{json.dumps(tool_result, ensure_ascii=False, indent=2)[:4000]}",
                })

                if len(conversation) > 40:
                    conversation = [conversation[0]] + conversation[-30:]

            if self._stop_event.is_set():
                self._status = "stopped"
                self.activity_logger.log("stopped", self.agent_name, "Agent stopped by user")
            else:
                self._status = "completed"
                self.activity_logger.log(
                    "max_iterations", self.agent_name,
                    f"Reached max iterations ({MAX_ITERATIONS})",
                )
        except Exception as e:
            self._error = traceback.format_exc()
            self._status = "error"
            self.activity_logger.log("error", self.agent_name, str(e))

    # ── Helpers ─────────────────────────────────────────────────

    def _observe(self) -> str:
        """Build initial context from memory and incoming messages."""
        parts: List[str] = []

        recent = self.memory_store.get_recent(5)
        if recent:
            parts.append("Recent memory:")
            for m in recent:
                parts.append(f"  [{m.get('key', '')}] {_truncate(m.get('content', ''), 200)}")

        msgs = self.tool_router.route("message_bus", {"action": "receive"})
        incoming = msgs.get("messages", [])
        if incoming:
            parts.append("Incoming messages:")
            for msg in incoming[-5:]:
                parts.append(f"  From {msg.get('from_id', '?')}: {_truncate(msg.get('content', ''), 200)}")

        return "\n".join(parts) if parts else "No prior context."


def _truncate(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."
