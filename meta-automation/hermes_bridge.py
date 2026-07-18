"""
Hermes LLM Bridge — File-based request/response protocol.

The Python automation scripts call structured_output(prompt, schema)
which writes a request file and waits for Hermes to write the response.

Hermes monitors the request directory, processes requests, and writes responses.
"""
import json, os, time, uuid
from pathlib import Path

BRIDGE_DIR = Path("/tmp/omq_bridge")

def _ensure_dir():
    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)

def structured_output(prompt: str, output_schema: dict, input_text: str = "") -> dict:
    """
    Request structured LLM output. Blocks until response is ready.

    Args:
        prompt: The instruction prompt
        output_schema: JSON schema for the expected output
        input_text: Optional input text context

    Returns:
        The generated result matching the schema

    Raises:
        TimeoutError: If no response after 120 seconds
    """
    _ensure_dir()
    req_id = str(uuid.uuid4())[:8]
    req_file = BRIDGE_DIR / f"req_{req_id}.json"
    resp_file = BRIDGE_DIR / f"resp_{req_id}.json"

    request = {
        "id": req_id,
        "type": "structured_output",
        "prompt": prompt,
        "output_schema": output_schema,
        "input_text": input_text,
    }
    req_file.write_text(json.dumps(request, ensure_ascii=False, indent=2))

    # Wait for response
    for _ in range(240):  # 120 seconds max
        if resp_file.exists():
            try:
                resp = json.loads(resp_file.read_text())
                resp_file.unlink()
                req_file.unlink()
                if "error" in resp:
                    raise RuntimeError(resp["error"])
                return resp["result"]
            except json.JSONDecodeError:
                time.sleep(0.5)
                continue
        time.sleep(0.5)

    # Cleanup
    if req_file.exists():
        req_file.unlink()
    raise TimeoutError(f"LLM bridge timeout after 120s (req {req_id})")


def quick_search(query: str) -> str:
    """
    Request a web search. Blocks until response is ready.
    """
    _ensure_dir()
    req_id = str(uuid.uuid4())[:8]
    req_file = BRIDGE_DIR / f"req_{req_id}.json"
    resp_file = BRIDGE_DIR / f"resp_{req_id}.json"

    request = {
        "id": req_id,
        "type": "quick_search",
        "query": query,
    }
    req_file.write_text(json.dumps(request, ensure_ascii=False, indent=2))

    for _ in range(120):
        if resp_file.exists():
            try:
                resp = json.loads(resp_file.read_text())
                resp_file.unlink()
                req_file.unlink()
                if "error" in resp:
                    raise RuntimeError(resp["error"])
                return resp["result"]
            except json.JSONDecodeError:
                time.sleep(0.5)
                continue
        time.sleep(0.5)

    if req_file.exists():
        req_file.unlink()
    raise TimeoutError(f"Quick search bridge timeout (req {req_id})")


def text2im(prompt: str, model: str = "gemini-flash-image", aspect_ratio: str = "1:1") -> dict:
    """
    Request image generation through the bridge.
    Returns {"local_path": str, "url": str | None}
    """
    _ensure_dir()
    req_id = str(uuid.uuid4())[:8]
    req_file = BRIDGE_DIR / f"req_{req_id}.json"
    resp_file = BRIDGE_DIR / f"resp_{req_id}.json"

    request = {
        "id": req_id,
        "type": "text2im",
        "prompt": prompt,
        "model": model,
        "aspect_ratio": aspect_ratio,
    }
    req_file.write_text(json.dumps(request, ensure_ascii=False, indent=2))

    for _ in range(240):
        if resp_file.exists():
            try:
                resp = json.loads(resp_file.read_text())
                resp_file.unlink()
                req_file.unlink()
                if "error" in resp:
                    raise RuntimeError(resp["error"])
                return resp["result"]
            except json.JSONDecodeError:
                time.sleep(0.5)
                continue
        time.sleep(0.5)

    if req_file.exists():
        req_file.unlink()
    raise TimeoutError(f"text2im bridge timeout (req {req_id})")
