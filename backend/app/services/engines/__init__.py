"""
Engine registry — maps simulation mode names to engine classes.
"""

from typing import Dict, Type
from ..simulation_framework import SimulationEngine

_registry: Dict[str, Type[SimulationEngine]] = {}


def register_engine(mode: str, engine_cls: Type[SimulationEngine]) -> None:
    _registry[mode] = engine_cls


def get_engine(mode: str) -> SimulationEngine:
    """Return an instantiated engine for the given mode, or raise KeyError."""
    if mode not in _registry:
        raise KeyError(f"No engine registered for mode '{mode}'. Available: {list(_registry.keys())}")
    return _registry[mode]()


def list_engines() -> Dict[str, str]:
    """Return a dict of mode -> engine class name."""
    return {mode: cls.__name__ for mode, cls in _registry.items()}


# Auto-register built-in engines on import
from .document_engine import DocumentSimEngine          # noqa: E402
from .prompt_engine import PromptSimEngine              # noqa: E402
from .product_launch_engine import ProductLaunchEngine  # noqa: E402
from .economy_engine import EconomySimEngine            # noqa: E402

register_engine("document", DocumentSimEngine)
register_engine("prompt", PromptSimEngine)
register_engine("product_launch", ProductLaunchEngine)
register_engine("economy", EconomySimEngine)
