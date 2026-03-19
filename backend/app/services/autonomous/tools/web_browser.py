"""
Web browser tool – fetches and parses web pages using requests + BeautifulSoup.
"""

from typing import Dict, Any

import requests
from bs4 import BeautifulSoup


class WebBrowser:
    TIMEOUT = 15
    MAX_TEXT_LENGTH = 15_000

    def navigate(self, url: str) -> Dict[str, Any]:
        if not url:
            return {"error": "No URL provided"}
        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            }
            resp = requests.get(url, headers=headers, timeout=self.TIMEOUT, allow_redirects=True)
            resp.raise_for_status()

            soup = BeautifulSoup(resp.text, "html.parser")

            for tag in soup(["script", "style", "noscript"]):
                tag.decompose()

            title = soup.title.string.strip() if soup.title and soup.title.string else ""
            text = soup.get_text(separator="\n", strip=True)
            if len(text) > self.MAX_TEXT_LENGTH:
                text = text[: self.MAX_TEXT_LENGTH] + "\n...[truncated]"

            links = []
            for a in soup.find_all("a", href=True)[:50]:
                href = a["href"]
                link_text = a.get_text(strip=True)[:120]
                if href.startswith(("http://", "https://")):
                    links.append({"url": href, "text": link_text})

            return {
                "title": title,
                "text_content": text,
                "links": links,
                "status_code": resp.status_code,
            }
        except requests.Timeout:
            return {"error": f"Request timed out after {self.TIMEOUT}s"}
        except requests.RequestException as e:
            return {"error": f"Request failed: {str(e)}"}
        except Exception as e:
            return {"error": f"Parse error: {str(e)}"}
