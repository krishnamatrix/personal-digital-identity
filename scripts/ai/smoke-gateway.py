#!/usr/bin/env python3
"""Run synthetic curl checks. Read only supported API-key assignments from an explicitly named env file."""
import argparse
import json
import os
import re
import shlex
import subprocess
import sys


def load_key(env_file):
    names = ("llm_api_key", "LLM_API_KEY", "AI_API_KEY")
    file_keys = {}
    env_key = next((os.environ[name].strip() for name in names if os.environ.get(name, "").strip()), "")
    if env_file and not env_key:
        with open(env_file, encoding="utf-8") as handle:
            for line in handle:
                match = re.match(r"^\s*(?:export\s+)?(llm_api_key|LLM_API_KEY|AI_API_KEY)\s*=\s*(.*)$", line)
                if match:
                    values = shlex.split(match.group(2), comments=True)
                    file_keys[match.group(1)] = values[0] if values else ""
    key = env_key or next((value for name in names if (value := file_keys.get(name, "").strip())), "")
    if not key or any(char in key for char in "\r\n"):
        raise ValueError("Set AI_API_KEY or provide --env-file containing that key.")
    return key


def request(base, key, route, payload=None):
    # Pass auth through curl's stdin config, not command-line arguments or output.
    escaped = key.replace("\\", "\\\\").replace('"', '\\"')
    config = f'header = "Authorization: Bearer {escaped}"\n'
    args = ["curl", "--silent", "--show-error", "--max-time", "120",
            "--config", "-", "--write-out", "\n%{http_code}", base + route]
    if payload is not None:
        args += ["--header", "Content-Type: application/json", "--data-raw", json.dumps(payload)]
    result = subprocess.run(args, input=config, text=True, capture_output=True)
    if result.returncode:
        return {"endpoint": route, "ok": False, "error": "curl_connection_or_timeout", "curl_exit": result.returncode}
    body, _, code = result.stdout.rpartition("\n")
    summary = {"endpoint": route, "status": int(code), "ok": 200 <= int(code) < 300}
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return {**summary, "ok": False, "error": "non_json_response"}
    if not summary["ok"]:
        # Avoid emitting provider errors, auth data or other response bodies.
        return summary
    if route == "/models":
        summary["models_count"] = len(data.get("data", []))
    elif route == "/chat/completions":
        choice = (data.get("choices") or [{}])[0]
        text = choice.get("message", {}).get("content", "")
        summary["finish_reason"] = choice.get("finish_reason")
        if payload.get("response_format"):
            try:
                summary["schema_matches"] = json.loads(text) == {"ok": True}
            except (json.JSONDecodeError, TypeError):
                summary["schema_matches"] = False
            summary["ok"] = summary["schema_matches"] and choice.get("finish_reason") == "stop"
        else:
            summary["text_matches"] = text.strip() == "OK"
            summary["ok"] = summary["text_matches"]
        summary["model"] = data.get("model")
    elif route == "/responses":
        texts = [part.get("text", "") for item in data.get("output", [])
                 for part in item.get("content", []) if part.get("type") == "output_text"]
        summary["text_matches"] = "".join(texts).strip() == "OK"
        summary["ok"] = summary["text_matches"]
    elif route == "/messages":
        text = "".join(part.get("text", "") for part in data.get("content", []) if part.get("type") == "text")
        summary["text_matches"] = text.strip() == "OK"
        summary["ok"] = summary["text_matches"]
    elif route == "/embeddings":
        vector = (data.get("data") or [{}])[0].get("embedding", [])
        summary["dimensions"] = len(vector)
        summary["ok"] = bool(vector) and all(isinstance(x, (int, float)) for x in vector)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", help="Load only llm_api_key/LLM_API_KEY/AI_API_KEY from this file; never executes it")
    parser.add_argument("--base-url", default="http://127.0.0.1:31415/v1")
    parser.add_argument("--model", default="auto")
    parser.add_argument("--all", action="store_true", help="Also test Responses, Messages and Embeddings")
    args = parser.parse_args()
    try:
        key = load_key(args.env_file)
    except (ValueError, OSError):
        print("Could not load AI_API_KEY. Supply the key securely via environment or --env-file.", file=sys.stderr)
        return 2
    base = args.base_url.rstrip("/")
    # Local-only guard prevents an accidental credential send to another service.
    if base != "http://127.0.0.1:31415/v1":
        print("This smoke script is restricted to the requested local gateway.", file=sys.stderr)
        return 2
    checks = [
        ("/models", None),
        ("/chat/completions", {"model": args.model, "messages": [{"role": "user", "content": "Reply with exactly OK, no punctuation."}], "max_tokens": 128, "stream": False}),
        ("/chat/completions", {"model": args.model, "messages": [{"role": "user", "content": 'Return JSON exactly {"ok":true}.'}], "response_format": {"type": "json_schema", "json_schema": {"name": "gateway_smoke", "strict": True, "schema": {"type": "object", "properties": {"ok": {"type": "boolean", "const": True}}, "required": ["ok"], "additionalProperties": False}}}, "max_tokens": 128, "stream": False}),
    ]
    if args.all:
        checks += [
            ("/responses", {"model": args.model, "input": "Reply with exactly OK, no punctuation.", "max_output_tokens": 128}),
            ("/messages", {"model": args.model, "max_tokens": 128, "messages": [{"role": "user", "content": "Reply with exactly OK, no punctuation."}]}),
            ("/embeddings", {"model": "auto", "input": "Synthetic gateway smoke test."}),
        ]
    passed = True
    for route, payload in checks:
        result = request(base, key, route, payload)
        print(json.dumps(result), flush=True)
        passed = passed and result["ok"]
        if result.get("status") == 401:
            break
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
