"""
Web search tool – DuckDuckGo HTML scraping (no API key required).
"""

from typing import Dict, Any, List
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup


class WebSearch:
    TIMEOUT = 15
    BASE_URL = "https://html.duckduckgo.com/html/"

    def search(self, query: str, num_results: int = 5) -> Dict[str, Any]:
        if not query.strip():
            return {"error": "No query provided"}

        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            }
            resp = requests.post(
                self.BASE_URL,
                data={"q": query},
                headers=headers,
                timeout=self.TIMEOUT,
            )
            resp.raise_for_status()

            soup = BeautifulSoup(resp.text, "html.parser")
            results: List[Dict[str, str]] = []

            for result_div in soup.select(".result"):
                if len(results) >= num_results:
                    break
                title_tag = result_div.select_one(".result__a")
                snippet_tag = result_div.select_one(".result__snippet")
                if title_tag:
                    title = title_tag.get_text(strip=True)
                    url = title_tag.get("href", "")
                    snippet = snippet_tag.get_text(strip=True) if snippet_tag else ""
                    if url:
                        results.append({
                            "title": title,
                            "url": url,
                            "snippet": snippet,
                        })

            return {"results": results, "query": query}
        except requests.Timeout:
            return {"error": f"Search timed out after {self.TIMEOUT}s"}
        except requests.RequestException as e:
            return {"error": f"Search failed: {str(e)}"}
        except Exception as e:
            return {"error": f"Parse error: {str(e)}"}
