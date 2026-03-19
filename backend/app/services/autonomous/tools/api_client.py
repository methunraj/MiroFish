"""
API client tool – makes HTTP requests via the requests library.
"""

from typing import Dict, Any, Optional

import requests


class APIClient:
    TIMEOUT = 30
    MAX_BODY_SIZE = 100_000

    def request(
        self,
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        body: Optional[Any] = None,
    ) -> Dict[str, Any]:
        if not url:
            return {"error": "No URL provided"}
        method = method.upper()
        if method not in ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"):
            return {"error": f"Unsupported HTTP method: {method}"}

        try:
            kwargs: Dict[str, Any] = {
                "method": method,
                "url": url,
                "timeout": self.TIMEOUT,
                "headers": headers or {},
            }
            if body is not None and method in ("POST", "PUT", "PATCH"):
                if isinstance(body, (dict, list)):
                    kwargs["json"] = body
                else:
                    kwargs["data"] = str(body)

            resp = requests.request(**kwargs)
            resp_body = resp.text
            if len(resp_body) > self.MAX_BODY_SIZE:
                resp_body = resp_body[: self.MAX_BODY_SIZE] + "\n...[truncated]"

            return {
                "status": resp.status_code,
                "body": resp_body,
                "headers": dict(resp.headers),
            }
        except requests.Timeout:
            return {"error": f"Request timed out after {self.TIMEOUT}s"}
        except requests.RequestException as e:
            return {"error": f"Request failed: {str(e)}"}
        except Exception as e:
            return {"error": str(e)}
