"""
Background episode processing worker
Processes unprocessed episodes through LLM entity extraction
"""

import time
from typing import Optional, Callable

from .entity_extractor import EntityExtractor
from .graph_store import GraphStore
from ..utils.logger import get_logger

logger = get_logger('parallelworld.extraction_worker')


class ExtractionWorker:
    """
    Background worker that processes unprocessed episodes.
    Replaces Zep Cloud's automatic processing with local LLM extraction.
    """

    def __init__(self, llm_client=None):
        self.extractor = EntityExtractor(llm_client=llm_client)
        self.store = GraphStore()

    def process_episode(self, episode_uuid: str, graph_id: str):
        """Process a single episode"""
        self.extractor.extract_from_episode(episode_uuid, graph_id)

    def process_all_pending(
        self,
        graph_id: str,
        progress_callback: Optional[Callable] = None,
        timeout: int = 600
    ):
        """
        Process all unprocessed episodes for a graph.

        Args:
            graph_id: Graph ID
            progress_callback: Optional callback(msg, progress_ratio)
            timeout: Maximum processing time in seconds
        """
        start_time = time.time()
        total_processed = 0

        while True:
            if time.time() - start_time > timeout:
                if progress_callback:
                    progress_callback(
                        f"Processing timeout, {total_processed} episodes processed",
                        1.0
                    )
                break

            pending = self.store.get_pending_episodes(graph_id)
            if not pending:
                if progress_callback:
                    progress_callback(
                        f"All episodes processed ({total_processed} total)",
                        1.0
                    )
                break

            total_pending = len(pending)
            for i, episode in enumerate(pending):
                if time.time() - start_time > timeout:
                    if progress_callback:
                        progress_callback(
                            f"Processing timeout ({total_processed}/{total_pending} done)",
                            total_processed / total_pending if total_pending > 0 else 1.0
                        )
                    return

                ep_uuid = episode["uuid"]
                if progress_callback:
                    progress_callback(
                        f"Extracting entities... episode {total_processed + 1}/{total_pending}",
                        total_processed / total_pending if total_pending > 0 else 0
                    )

                try:
                    self.process_episode(ep_uuid, graph_id)
                    total_processed += 1
                except Exception as e:
                    logger.error(f"Failed to process episode {ep_uuid}: {e}")
                    self.store.mark_episode_processed(ep_uuid, error=str(e))
                    total_processed += 1

            # Small delay between batches
            time.sleep(0.5)

    def wait_for_episodes(
        self,
        graph_id: str,
        progress_callback: Optional[Callable] = None,
        timeout: int = 600
    ):
        """
        Wait for all episodes to be processed.
        Same interface as the old _wait_for_episodes in graph_builder.

        Args:
            graph_id: Graph ID (used instead of episode UUIDs)
            progress_callback: Optional callback(msg, progress_ratio)
            timeout: Maximum processing time in seconds
        """
        self.process_all_pending(graph_id, progress_callback, timeout)
