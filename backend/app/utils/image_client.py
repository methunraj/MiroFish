"""
Image generation client for AI-generated agent portraits.
Uses OpenAI-compatible API (configured for Gemini image model).
"""

import os
import base64
import hashlib
import logging
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from openai import OpenAI
from ..config import Config

logger = logging.getLogger("parallelworld.image_client")

PORTRAITS_DIR = os.path.join(Config.UPLOAD_FOLDER, "portraits")


class ImageClient:
    """Generates AI portraits for simulation agents."""

    def __init__(self):
        self.api_key = Config.IMAGE_API_KEY
        self.base_url = Config.IMAGE_BASE_URL
        self.model = Config.IMAGE_MODEL_NAME
        self._client = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.api_key:
                raise ValueError("IMAGE_API_KEY is not configured")
            self._client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        return self._client

    @property
    def available(self) -> bool:
        return bool(self.api_key and self.base_url and self.model)

    def _build_portrait_prompt(self, name: str, demographics: dict, personality: dict) -> str:
        age = demographics.get("age", "30")
        gender = demographics.get("gender", "person")
        occupation = demographics.get("occupation", "professional")
        ptype = personality.get("type", personality.get("personality_type", ""))

        return (
            f"Create a pixel art portrait avatar of {name}, a {age} year old {gender} "
            f"who works as a {occupation}. "
            f"{'Personality: ' + ptype + '. ' if ptype else ''}"
            f"Style: retro 8-bit pixel art, game boy inspired, "
            f"green monochrome palette (#0F380F, #306230, #8BAC0F, #9BBC0F), "
            f"clean simple face, 64x64 pixel grid upscaled, dark background. "
            f"Square format, centered face, no text."
        )

    def generate_portrait(self, agent_id: str, name: str, demographics: dict = None, personality: dict = None) -> str:
        """Generate a portrait for an agent and return the URL path."""
        os.makedirs(PORTRAITS_DIR, exist_ok=True)

        filename = f"{agent_id}.png"
        filepath = os.path.join(PORTRAITS_DIR, filename)
        url_path = f"/uploads/portraits/{filename}"

        if os.path.exists(filepath):
            return url_path

        if not self.available:
            logger.warning("Image API not configured, using fallback")
            return ""

        try:
            prompt = self._build_portrait_prompt(name, demographics or {}, personality or {})
            response = self.client.images.generate(
                model=self.model,
                prompt=prompt,
                n=1,
                size="256x256",
            )

            image_data = response.data[0]

            if hasattr(image_data, 'b64_json') and image_data.b64_json:
                img_bytes = base64.b64decode(image_data.b64_json)
                with open(filepath, "wb") as f:
                    f.write(img_bytes)
            elif hasattr(image_data, 'url') and image_data.url:
                import requests
                img_resp = requests.get(image_data.url, timeout=30)
                img_resp.raise_for_status()
                with open(filepath, "wb") as f:
                    f.write(img_resp.content)
            else:
                logger.warning(f"No image data returned for {agent_id}")
                return ""

            logger.info(f"Portrait generated for {name} ({agent_id})")
            return url_path

        except Exception as exc:
            logger.error(f"Portrait generation failed for {agent_id}: {exc}")
            return ""

    def generate_portraits_batch(self, agents: list, max_workers: int = 4) -> dict:
        """Generate portraits for multiple agents in parallel.

        Args:
            agents: list of dicts with keys: id, name, demographics, personality
            max_workers: thread pool size

        Returns:
            dict mapping agent_id -> portrait_url
        """
        results = {}

        if not self.available:
            logger.warning("Image API not configured, skipping portrait generation")
            return {a["id"]: "" for a in agents}

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {}
            for agent in agents:
                future = executor.submit(
                    self.generate_portrait,
                    agent["id"],
                    agent["name"],
                    agent.get("demographics", {}),
                    agent.get("personality", {}),
                )
                futures[future] = agent["id"]

            for future in as_completed(futures):
                agent_id = futures[future]
                try:
                    url = future.result()
                    results[agent_id] = url
                except Exception as exc:
                    logger.error(f"Portrait batch error for {agent_id}: {exc}")
                    results[agent_id] = ""

        return results


_image_client = None

def get_image_client() -> ImageClient:
    global _image_client
    if _image_client is None:
        _image_client = ImageClient()
    return _image_client
