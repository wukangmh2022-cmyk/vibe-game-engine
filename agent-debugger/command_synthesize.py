#!/usr/bin/env python3
"""Parallel native tool-call synthesis for command-mapping SFT data."""

from __future__ import annotations

import argparse
import concurrent.futures
import http.client
import json
import os
import re
import subprocess
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from build_command_db import ROOT as REPO_ROOT
from command_db import CommandDatabase, build_command_database, resource_refs
from command_validator import DIRECT_RUNTIME_TYPES, CommandSampleValidator
from curriculum_plan import DEFAULT_PLAN_PATH, PREFERRED_FAMILIES, PRIMARY_ZH, build_curriculum, load_curriculum, sample_fingerprint, save_curriculum, slice_plan

DEBUGGER = REPO_ROOT / "agent-debugger"
MOTIF_TYPES = {
    "SHOW_IMAGE", "SHOW_CHOICES", "SET_CLICKABLE", "SET_DRAGGABLE",
    "CREATE_DROP_ZONE", "CHECK_IN_AREA", "FLIP_CARD", "SET_VARIABLE",
    "IF_CONDITION", "SCENE_REDIRECT", "NEXT_LEVEL", "UPDATE_TEXT", "MOVE_TO",
    "SET_ELEMENT_STYLE", "BREAK",
}
REQUIRED_MOTIF_TYPES = {"MOVE_TO", "UPDATE_TEXT", "SET_ELEMENT_STYLE", "BREAK"}

# Compact contracts distilled from the engine guide and concrete handlers. They
# keep the teacher from importing unrelated game-engine semantics into this DSL.
COMMAND_CONTRACTS = {
    "SET_VARIABLE": {"required": ["key", "value"], "notes": "op is set/add/sub/mul/div; use scalar values only."},
    "WAIT": {"required": ["duration"], "notes": "duration is a non-negative millisecond number."},
    "MOVE_TO": {"required": ["elementId", "x", "y"], "precondition": "elementId must be created earlier in this motif."},
    "SHOW_IMAGE": {"required": ["elementId", "resourceId"], "notes": "resourceId must be an existing image from level metadata."},
    "SHOW_TEXT": {"required": ["elementId", "text"]},
    "UPDATE_TEXT": {"required": ["elementId", "text"], "precondition": "elementId must be created earlier in this motif."},
    "SHOW_CHOICES": {"required": ["elementId", "options"], "notes": "each option requires text; nested commands are optional."},
    "SET_ELEMENT_STYLE": {"required": ["elementId", "style"], "precondition": "elementId must be created earlier in this motif."},
    "NEXT_LEVEL": {"required": []},
    "IF_CONDITION": {"required": ["condition", "trueCommands", "falseCommands"], "notes": "condition.type is variable (key/operator/value) or expression (expression); use trueCommands/falseCommands arrays, which may be empty."},
    "JUMP_TO": {"required": ["target"], "notes": "target is the target command id consumed by the runtime handler."},
    "LOOP": {"required": ["commands"], "notes": "commands must be non-empty; BREAK only belongs in this array."},
    "BREAK": {"required": [], "precondition": "must be nested inside LOOP.commands."},
    "EMIT_SIGNAL": {"required": ["signal"]},
    "BGM_PLAY": {"required": ["musicId"], "notes": "musicId must be an existing audio resource; volume is 0..1."},
    "BGM_STOP": {"required": []},
    "SE_PLAY": {"required": ["soundId"], "notes": "soundId must be an existing audio resource; volume is 0..1."},
    "SCENE_REDIRECT": {"required": ["url"], "notes": "url is a scene path or this; it emits a redirect request."},
}


DECISION_SCHEMA = {
    "type": "object",
    "properties": {
        "goal": {"type": "string", "maxLength": 240},
        "evidence": {"type": "string", "maxLength": 400},
        "hypothesis": {"type": "string", "maxLength": 240},
        "verification": {"type": "string", "maxLength": 240},
    },
    "required": ["goal", "evidence", "hypothesis", "verification"],
    "additionalProperties": False,
}


def tool(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": {"decision": DECISION_SCHEMA, **properties},
                "required": ["decision", *required],
                "additionalProperties": False,
            },
        },
    }


TOOLS = [
    tool("get_command_contract", "Get the authoritative compact contract for one supported command type.", {"command_type": {"type": "string"}}, ["command_type"]),
    tool("find_command_examples", "Find compact real examples by command type or semantic term.", {"command_type": {"type": "string"}, "query": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 10}}, []),
    tool("get_command_context", "Get one command and up to ten nearby commands from its original command stream.", {"command_key": {"type": "string"}, "before": {"type": "integer", "minimum": 0, "maximum": 10}, "after": {"type": "integer", "minimum": 0, "maximum": 10}}, ["command_key"]),
    tool("get_level_metadata", "Get compact level metadata without loading full scene JSON.", {"level_key": {"type": "string"}}, ["level_key"]),
    tool("validate_sample", "Validate a candidate command mapping sample. Fix returned errors before finishing.", {"sample": {"type": "object"}}, ["sample"]),
    tool("finish", "Finish with a sample only after validate_sample returned valid=true.", {"sample": {"type": "object"}}, ["sample"]),
]


def compact(value: Any, limit: int = 3000) -> str:
    return json.dumps(value, ensure_ascii=False)[-limit:]



DEFAULT_ENV_PATH = DEBUGGER / ".env"


def read_env_file(path: Path) -> dict[str, str]:
    """Parse KEY=VALUE lines from a dotenv-style file without exporting into os.environ."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values


def _endpoint_from_values(values: dict[str, str], suffix: str = "") -> dict[str, str] | None:
    base = (values.get(f"VIBE_TEACHER_API_BASE{suffix}") or "").strip().rstrip("/")
    key = (values.get(f"VIBE_TEACHER_API_KEY{suffix}") or "").strip()
    model = (values.get(f"VIBE_TEACHER_MODEL{suffix}") or "").strip()
    if not base or not model:
        return None
    # OpenAI-compatible hosts often omit /v1 in user config; chat path expects it.
    if not base.endswith(("/v1", "/v4", "/paas/v4", "/messages")) and "/api/" not in base:
        base = base + "/v1"
    slot = suffix.lstrip("_") or "1"
    # Per-slot protocol: VIBE_TEACHER_{N}_TOOL_PROTOCOL (e.g. VIBE_TEACHER_2_TOOL_PROTOCOL=anthropic_message)
    # Also accept VIBE_TEACHER_TOOL_PROTOCOL_{N} for symmetry.
    protocol = (
        values.get(f"VIBE_TEACHER_{slot}_TOOL_PROTOCOL")
        or values.get(f"VIBE_TEACHER_TOOL_PROTOCOL_{slot}")
        or ""
    ).strip() or None
    return {
        "slot": slot,
        "api_base": base,
        "api_key": key,
        "model": model,
        **({"tool_protocol": protocol} if protocol else {}),
    }


def collect_teacher_endpoints(values: dict[str, str], cli: dict[str, str] | None = None) -> list[dict[str, str]]:
    """Load up to 4 teacher endpoints. Empty slots are skipped.

    Supported env forms:
      - legacy single: VIBE_TEACHER_API_BASE / _API_KEY / _MODEL
      - numbered: VIBE_TEACHER_API_BASE_1..4, VIBE_TEACHER_API_KEY_1..4, VIBE_TEACHER_MODEL_1..4
    CLI single-endpoint overrides only seed slot 1 when no numbered slots are present.
    """
    endpoints: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()

    def add(item: dict[str, str] | None) -> None:
        if not item:
            return
        fingerprint = (item["api_base"], item["api_key"], item["model"])
        if fingerprint in seen:
            return
        seen.add(fingerprint)
        endpoints.append(item)

    # Prefer explicit numbered slots 1..4.
    numbered = [_endpoint_from_values(values, f"_{index}") for index in range(1, 5)]
    if any(numbered):
        for item in numbered:
            add(item)
    else:
        add(_endpoint_from_values(values, ""))

    # CLI fallback for dry local runs / one-off overrides.
    cli = cli or {}
    if not endpoints and (cli.get("api_base") and cli.get("model")):
        add({"slot": "cli", "api_base": cli["api_base"], "api_key": cli.get("api_key", ""), "model": cli["model"]})
    elif endpoints and cli.get("api_base") and cli.get("model") and not any(values.get(f"VIBE_TEACHER_API_BASE_{i}") for i in range(1, 5)):
        # If only legacy env exists, allow CLI to replace the single endpoint.
        if cli.get("api_base") != endpoints[0]["api_base"] or cli.get("model") != endpoints[0]["model"] or cli.get("api_key", "") != endpoints[0]["api_key"]:
            # Keep env primary; CLI was already baked into args defaults from env at startup.
            pass

    return endpoints


class TeacherConfigStore:
    """Hot-reloading multi-endpoint teacher config with sticky worker load balancing.

    workers are pinned to endpoint index: worker_id % len(endpoints).
    So workers=4 with 2 keys => each key serves 2 workers; workers=8 with 4 keys => 2 each.
    Editing .env mid-run reloads on the next teacher call after mtime changes.
    """

    def __init__(self, env_path: Path, shared: dict[str, Any], cli: dict[str, str]):
        self.env_path = env_path
        self.shared = shared
        self.cli = cli
        self._lock = threading.Lock()
        self._mtime: float | None = None
        self._endpoints: list[dict[str, str]] = []
        self._reload(force=True)

    def _reload(self, force: bool = False) -> bool:
        mtime = self.env_path.stat().st_mtime if self.env_path.exists() else None
        if not force and mtime == self._mtime:
            return False
        values = read_env_file(self.env_path)
        # Also allow process env as weak fallback for non-file launches.
        merged = {**{k: v for k, v in os.environ.items() if k.startswith("VIBE_TEACHER_")}, **values}
        endpoints = collect_teacher_endpoints(merged, self.cli)
        if not endpoints:
            raise RuntimeError(
                "no teacher endpoints configured; set VIBE_TEACHER_API_BASE/_KEY/_MODEL "
                "or numbered VIBE_TEACHER_API_BASE_1..4 / _API_KEY_1..4 / _MODEL_1..4 in agent-debugger/.env"
            )
        self._endpoints = endpoints
        self._mtime = mtime
        return True

    def maybe_reload(self) -> bool:
        with self._lock:
            changed = self._reload(force=False)
            return changed

    def endpoints_snapshot(self) -> list[dict[str, str]]:
        with self._lock:
            self._reload(force=False)
            return [dict(item) for item in self._endpoints]

    def _shared_runtime_overrides(self, values: dict[str, str], config: dict[str, Any]) -> dict[str, Any]:
        if values.get("VIBE_TEACHER_MAX_TOKENS"):
            config["max_tokens"] = int(values["VIBE_TEACHER_MAX_TOKENS"])
        if values.get("VIBE_TEACHER_MAX_ACTIONS"):
            config["max_actions"] = int(values["VIBE_TEACHER_MAX_ACTIONS"])
        if values.get("VIBE_TEACHER_TOOL_PROTOCOL") in {"openai", "json-envelope", "anthropic_message"}:
            config["tool_protocol"] = values["VIBE_TEACHER_TOOL_PROTOCOL"]
        if values.get("VIBE_TEACHER_API_RETRIES"):
            config["api_retries"] = int(values["VIBE_TEACHER_API_RETRIES"])
        if values.get("VIBE_TEACHER_API_RETRY_BACKOFF"):
            config["api_retry_backoff"] = float(values["VIBE_TEACHER_API_RETRY_BACKOFF"])
        if values.get("VIBE_TEACHER_TIMEOUT"):
            config["timeout"] = int(values["VIBE_TEACHER_TIMEOUT"])
        return config

    def _config_from_endpoint(self, endpoint: dict[str, str], values: dict[str, str] | None = None) -> dict[str, Any]:
        values = values if values is not None else read_env_file(self.env_path)
        config = dict(self.shared)
        config.update({
            "api_base": endpoint["api_base"],
            "api_key": endpoint["api_key"],
            "model": endpoint["model"],
            "endpoint_slot": endpoint["slot"],
            "endpoint_count": len(self._endpoints),
        })
        self._shared_runtime_overrides(values, config)
        # Per-slot protocol overrides shared one.
        if endpoint.get("tool_protocol"):
            config["tool_protocol"] = endpoint["tool_protocol"]
        return config

    def config_for_worker(self, worker_id: int) -> dict[str, Any]:
        with self._lock:
            self._reload(force=False)
            endpoint = self._endpoints[worker_id % len(self._endpoints)]
            return self._config_from_endpoint(endpoint)

    def configs_for_failover(self, worker_id: int) -> list[dict[str, Any]]:
        """Primary sticky endpoint first, then the rest for job-level failover."""
        with self._lock:
            self._reload(force=False)
            if not self._endpoints:
                return []
            values = read_env_file(self.env_path)
            count = len(self._endpoints)
            order = [(worker_id + offset) % count for offset in range(count)]
            return [self._config_from_endpoint(self._endpoints[index], values) for index in order]


def append_jsonl(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        handle.flush()
        os.fsync(handle.fileno())



def teacher_request_headers(config: dict[str, Any], protocol: str = "openai") -> dict[str, str]:
    """Browser-like headers: some reverse proxies block Python-urllib UA (CF 1010)."""
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/126.0.0.0 Safari/537.36"
        ),
    }
    api_key = config.get("api_key") or ""
    if protocol == "anthropic_message":
        headers["anthropic-version"] = "2023-06-01"
        if api_key:
            headers["x-api-key"] = api_key
            headers["Authorization"] = f"Bearer {api_key}"
    elif api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def decision(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError("decision is required")
    keys = ("goal", "evidence", "hypothesis", "verification")
    if any(not isinstance(value.get(key), str) or not value[key].strip() for key in keys):
        raise ValueError("decision requires non-empty goal, evidence, hypothesis, verification")
    return {key: value[key][:400] for key in keys}


def call_teacher(config: dict[str, Any], messages: list[dict[str, Any]], use_tools: bool = True) -> dict[str, Any]:
    if config.get("tool_protocol") == "anthropic_message":
        return call_teacher_anthropic(config, messages, use_tools=use_tools)
    endpoint = config["api_base"].rstrip("/") + "/chat/completions"
    payload: dict[str, Any] = {
        "model": config["model"],
        "messages": messages,
        "temperature": config["temperature"],
        "max_tokens": config["max_tokens"],
    }
    if config.get("reasoning_effort"):
        payload["reasoning_effort"] = config["reasoning_effort"]
    if config.get("thinking") is not None:
        payload["thinking"] = config["thinking"]
    if use_tools:
        payload["tools"] = TOOLS
        payload["tool_choice"] = "auto"
    body = json.dumps(payload).encode("utf-8")
    retries = max(1, int(config.get("api_retries", 4)))
    backoff = float(config.get("api_retry_backoff", 1.5))
    retryable_http = {408, 409, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524}
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        request = urllib.request.Request(endpoint, data=body, method="POST", headers=teacher_request_headers(config, "openai"))
        try:
            with urllib.request.urlopen(request, timeout=config["timeout"]) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[-800:]
            last_error = RuntimeError(f"teacher API HTTP {error.code}: {detail}")
            if error.code not in retryable_http or attempt >= retries:
                raise last_error from error
        except urllib.error.URLError as error:
            last_error = RuntimeError(f"teacher API connection failed: {error.reason}")
            if attempt >= retries:
                raise last_error from error
        except TimeoutError as error:
            last_error = RuntimeError(f"teacher API timed out after {config['timeout']}s")
            if attempt >= retries:
                raise last_error from error
        except (http.client.RemoteDisconnected, http.client.IncompleteRead, ConnectionResetError, BrokenPipeError) as error:
            last_error = RuntimeError(f"teacher API connection dropped: {error}")
            if attempt >= retries:
                raise last_error from error
        time.sleep(min(20.0, backoff * (2 ** (attempt - 1))))
    assert last_error is not None
    raise last_error


def _openai_tools_to_anthropic(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert OpenAI function-tool definitions to Anthropic tool format."""
    result = []
    for item in tools:
        fn = item.get("function", {})
        schema = fn.get("parameters") or {"type": "object", "properties": {}}
        result.append({
            "name": fn.get("name", ""),
            "description": fn.get("description", ""),
            "input_schema": schema,
        })
    return result


def _openai_messages_to_anthropic(messages: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    """Split system prompt and convert messages to Anthropic format.

    tool messages become user messages with tool_result content blocks.
    """
    system = ""
    anthropic_msgs: list[dict[str, Any]] = []
    for msg in messages:
        role = msg.get("role", "")
        if role == "system":
            system = msg.get("content") or ""
            continue
        if role == "tool":
            # tool result → user message with tool_result block
            anthropic_msgs.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": msg.get("tool_call_id", "call-0"),
                    "content": str(msg.get("content", "")),
                }],
            })
            continue
        if role == "assistant":
            content_blocks: list[dict[str, Any]] = []
            text = msg.get("content")
            if text:
                content_blocks.append({"type": "text", "text": str(text)})
            for call in (msg.get("tool_calls") or []):
                fn = call.get("function", {})
                try:
                    arguments = json.loads(fn.get("arguments", "{}"))
                except json.JSONDecodeError:
                    arguments = {}
                content_blocks.append({
                    "type": "tool_use",
                    "id": call.get("id", "call-0"),
                    "name": fn.get("name", ""),
                    "input": arguments,
                })
            anthropic_msgs.append({"role": "assistant", "content": content_blocks or (msg.get("content") or "")})
            continue
        # user
        anthropic_msgs.append({"role": "user", "content": msg.get("content") or ""})
    return system, anthropic_msgs


def _anthropic_response_to_openai(response: dict[str, Any]) -> dict[str, Any]:
    """Normalise an Anthropic /messages response to OpenAI choices[0].message shape."""
    content_blocks = response.get("content") or []
    text_parts: list[str] = []
    tool_calls: list[dict[str, Any]] = []
    for block in content_blocks:
        btype = block.get("type")
        if btype == "text":
            text_parts.append(block.get("text") or "")
        elif btype == "tool_use":
            tool_calls.append({
                "id": block.get("id", "call-0"),
                "type": "function",
                "function": {
                    "name": block.get("name", ""),
                    "arguments": json.dumps(block.get("input") or {}, ensure_ascii=False),
                },
            })
    message: dict[str, Any] = {
        "role": "assistant",
        "content": "\n".join(text_parts) if text_parts else None,
    }
    if tool_calls:
        message["tool_calls"] = tool_calls
    return {"choices": [{"message": message}], "_anthropic_raw": response}


def call_teacher_anthropic(config: dict[str, Any], messages: list[dict[str, Any]], use_tools: bool = True) -> dict[str, Any]:
    """Call Anthropic Messages API and return normalised OpenAI-like response."""
    endpoint = config["api_base"].rstrip("/") + "/messages"
    system, anthropic_msgs = _openai_messages_to_anthropic(messages)
    payload: dict[str, Any] = {
        "model": config["model"],
        "max_tokens": config.get("max_tokens", 1200),
        "messages": anthropic_msgs,
    }
    if system:
        payload["system"] = system
    if use_tools:
        payload["tools"] = _openai_tools_to_anthropic(TOOLS)
        payload["tool_choice"] = {"type": "auto"}
    body = json.dumps(payload).encode("utf-8")
    retries = max(1, int(config.get("api_retries", 4)))
    backoff = float(config.get("api_retry_backoff", 1.5))
    retryable_http = {408, 409, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529}
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        request = urllib.request.Request(endpoint, data=body, method="POST", headers=teacher_request_headers(config, "anthropic_message"))
        try:
            with urllib.request.urlopen(request, timeout=config["timeout"]) as response:
                raw = json.loads(response.read().decode("utf-8"))
                return _anthropic_response_to_openai(raw)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[-800:]
            last_error = RuntimeError(f"teacher API HTTP {error.code}: {detail}")
            if error.code not in retryable_http or attempt >= retries:
                raise last_error from error
        except urllib.error.URLError as error:
            last_error = RuntimeError(f"teacher API connection failed: {error.reason}")
            if attempt >= retries:
                raise last_error from error
        except TimeoutError as error:
            last_error = RuntimeError(f"teacher API timed out after {config['timeout']}s")
            if attempt >= retries:
                raise last_error from error
        except (http.client.RemoteDisconnected, http.client.IncompleteRead, ConnectionResetError, BrokenPipeError) as error:
            last_error = RuntimeError(f"teacher API connection dropped: {error}")
            if attempt >= retries:
                raise last_error from error
        time.sleep(min(20.0, backoff * (2 ** (attempt - 1))))
    assert last_error is not None
    raise last_error


def fallback_tool_call(content: str) -> list[dict[str, Any]]:
    """Allow local APIs without native tool_call serialization to use JSON envelopes."""
    try:
        value = parse_json_object(content)
        if isinstance(value, dict) and isinstance(value.get("tool"), str) and isinstance(value.get("arguments"), dict):
            return [{"id": "json-envelope", "type": "function", "function": {"name": value["tool"], "arguments": json.dumps(value["arguments"], ensure_ascii=False)}}]
    except Exception:
        pass
    return []


def parse_json_object(content: str) -> dict[str, Any]:
    """Extract one JSON object, accepting common fenced-model responses."""
    text = content.strip()
    if text.startswith("```"):
        newline = text.find("\n")
        if newline >= 0:
            text = text[newline + 1:]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3].strip()
    decoder = json.JSONDecoder()
    start = text.find("{")
    if start < 0:
        raise ValueError("response has no JSON object")
    value, _ = decoder.raw_decode(text[start:])
    if not isinstance(value, dict):
        raise ValueError("response must be one JSON object")
    return value


class CommandToolOperator:
    def __init__(self, database: CommandDatabase, primary_type: str, sample_mode: str):
        self.database = database
        self.primary_type = primary_type
        self.sample_mode = sample_mode
        self.validator = CommandSampleValidator(database)
        self.exposed_assets: dict[str, dict[str, Any]] = {}
        self.source_examples: list[str] = []
        self.contracts_read: set[str] = set()
        self.last_validation: dict[str, Any] = {"valid": False, "errors": ["validate_sample has not run"], "warnings": []}

    def _expose(self, examples: list[dict[str, Any]]) -> None:
        for example in examples:
            self.source_examples.append(example["command_key"])

    def _expose_level_resources(self, metadata: dict[str, Any]) -> None:
        for resource in metadata.get("resources", []):
            if isinstance(resource, dict) and isinstance(resource.get("id"), str):
                self.exposed_assets[resource["id"]] = resource

    def find_command_examples(self, command_type: str = "", query: str = "", limit: int = 5) -> dict[str, Any]:
        examples = self.database.find_commands(command_type, query, limit)
        self._expose(examples)
        return {"examples": examples}

    def get_command_contract(self, command_type: str) -> dict[str, Any]:
        normalized = command_type.upper()
        contract = COMMAND_CONTRACTS.get(normalized)
        if not contract:
            raise KeyError(f"no executable command contract for {normalized}")
        self.contracts_read.add(normalized)
        return {"command_type": normalized, "contract": contract}

    def get_command_context(self, command_key: str, before: int = 5, after: int = 5) -> dict[str, Any]:
        result = self.database.command_context(command_key, before, after)
        self._expose([{**item, "level_key": result["target"]["level_key"], "scene_path": result["target"]["scene_path"], "level_name": result["target"]["level_name"]} for item in result["commands"]])
        return result

    def get_level_metadata(self, level_key: str) -> dict[str, Any]:
        metadata = self.database.level_metadata(level_key)
        self._expose_level_resources(metadata)
        return metadata

    def validate_sample(self, sample: dict[str, Any]) -> dict[str, Any]:
        minimum = 2 if self.sample_mode == "motif" else 1
        self.last_validation = self.validator.validate(sample, self.primary_type, minimum, self.exposed_assets)
        return self.last_validation

    def finish(self, sample: dict[str, Any]) -> dict[str, Any]:
        if self.primary_type.upper() not in self.contracts_read:
            return {"accepted": False, "validation": {"valid": False, "errors": ["get_command_contract must be called for the assigned primary command type"], "warnings": []}}
        validation = self.validate_sample(sample)
        if not validation["valid"]:
            return {"accepted": False, "validation": validation}
        return {"accepted": True, "sample": sample, "validation": validation}


def static_prompt(tool_protocol: str) -> str:
    prompt = "\n\n".join([
        (DEBUGGER / "prompts" / "command-synthesis.md").read_text(encoding="utf-8"),
        "Authoritative DSL sources: level-editor/src/guides/promptGuideInline.ts; level-editor/src/utils/commandTemplates.ts; src/commands/factory.ts. The database tools expose only real project examples and compact context.",
        "Curriculum mode: each job includes a global plan slot. Follow plan_id, template_id, intent_seed, level_key, primary command, supporting commands, and angle. Rewrite intent_seed into a concrete Chinese request, but keep the same teaching goal. Do not invent a different trajectory family. level_key and source scenes are retrieval anchors only: never put a game title, scene name, level number, level key, source path, or asset filename in the output intent. Write requests as if the user is authoring the current blank level. Prefer get_level_metadata(level_key) early when assets are needed.",
    ])
    if tool_protocol == "json-envelope":
        prompt += "\n\nTransport protocol: this local endpoint does not reliably serialize OpenAI tool_calls. For every tool action, reply with ONLY one JSON object: {\"tool\": \"tool_name\", \"arguments\": {\"decision\": {\"goal\": \"...\", \"evidence\": \"...\", \"hypothesis\": \"...\", \"verification\": \"...\"}, ...tool arguments...}}. Do not use Markdown or YAML. After every tool result, decide the next single tool yourself."
    return prompt


def make_jobs(database: CommandDatabase, samples: int | None, per_command: int | None) -> list[dict[str, Any]]:
    command_types = [item["command_type"] for item in database.stats()["command_types"] if item["command_type"] in DIRECT_RUNTIME_TYPES]
    if not command_types:
        raise RuntimeError("command database has no types supported by the runtime dry run")
    def job(command_type: str, variant: int) -> dict[str, Any]:
        return {"command_type": command_type, "variant": variant, "sample_mode": "atomic"}
    if per_command is not None:
        jobs = [job(command_type, variant) for command_type in command_types for variant in range(per_command)]
    else:
        assert samples is not None
        jobs = [job(command_types[index % len(command_types)], index // len(command_types)) for index in range(samples)]

    required = [index for index, item in enumerate(jobs) if item["command_type"] in REQUIRED_MOTIF_TYPES]
    for index in required:
        jobs[index]["sample_mode"] = "motif"
    target_motifs = round(len(jobs) * 0.28)
    optional = [index for index, item in enumerate(jobs) if item["command_type"] in MOTIF_TYPES and item["command_type"] not in REQUIRED_MOTIF_TYPES]
    extra = min(max(0, target_motifs - len(required)), len(optional))
    if extra:
        # Evenly spread optional motifs so the early command types do not receive
        # a disproportionate share of compound examples.
        chosen = {optional[(slot * len(optional)) // extra] for slot in range(extra)}
        for index in chosen:
            jobs[index]["sample_mode"] = "motif"
    return jobs


def make_jobs_from_plan(plan_slots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    generic_templates = {
        "atomic_single": "只做一件事：{primary}，用于当前关卡的{angle}",
        "create_wait": "先展示内容，再短暂停顿，用于当前关卡的{angle}",
        "create_move": "显示图片后把它移到目标位置，用于当前关卡的{angle}",
        "create_style": "创建元素后改样式，强调当前关卡的{angle}",
        "create_update_text": "先出文案，再改写同一文本元素，用于当前关卡的{angle}",
        "audio_wait": "播放反馈音效或背景音后停顿，用于当前关卡的{angle}",
        "var_if": "先改变量，再按条件分支，服务当前关卡的{angle}",
        "loop_break": "做一个可中断循环，服务当前关卡的{angle}",
        "choices_feedback": "给出选项，并在选择后写变量或发信号，用于当前关卡的{angle}",
        "score_gate": "更新分数或进度后检查门槛，通过则跳转，用于当前关卡的{angle}",
        "reveal_sequence": "先展示资源，停顿，再补提示或音效，用于当前关卡的{angle}",
        "signal_redirect": "先发信号再切场景或下一关，用于当前关卡的{angle}",
        "bgm_lifecycle": "管理背景音乐启停，用于当前关卡的{angle}",
        "move_style": "创建图片，移动，再改样式，形成短动画轨迹，用于当前关卡的{angle}",
        "text_then_choice": "先提示，停顿，再出选项，用于当前关卡的{angle}",
        "atomic_flow": "在当前关卡完成{angle}相关的单步{primary}",
    }
    jobs: list[dict[str, Any]] = []
    for slot in plan_slots:
        # Source levels only expose valid assets; they must not leak into the
        # training utterance for a user who is authoring a blank current level.
        plan = dict(slot)
        plan["intent_seed"] = generic_templates.get(plan.get("template_id"), "在当前关卡中完成{angle}相关的{primary}").format(
            primary=PRIMARY_ZH.get(plan["primary_command_type"], plan["primary_command_type"]),
            angle=plan.get("angle_zh", "交互流程"),
        )
        jobs.append(
            {
                "command_type": plan["primary_command_type"],
                "variant": plan["slot"],
                "sample_mode": plan["sample_mode"],
                "plan_id": plan.get("plan_id"),
                "plan": plan,
            }
        )
    return jobs


def normalize_training_intent(intent: str, plan: dict[str, Any] | None = None) -> str:
    """Remove retrieval-only source-level names from a user-facing utterance."""
    text = str(intent)
    plan = plan or {}
    anchors = set(PREFERRED_FAMILIES)
    anchors.update({str(plan.get("scene_family") or ""), str(plan.get("level_name") or "")})
    for anchor in sorted((item for item in anchors if item), key=len, reverse=True):
        text = text.replace(anchor, "当前关卡")
    # Source corpus labels such as "关卡3-2" are not part of the authoring API.
    text = re.sub(r"(?:第)?关卡\s*\d+(?:\s*[-－]\s*\d+)?", "当前关卡", text)
    text = re.sub(r"当前关卡(?:的)?当前关卡", "当前关卡", text)
    text = re.sub(r"当前关卡\s*当前关卡", "当前关卡", text)
    return text


def accepted_record(job_id: int, job: dict[str, Any], sample: dict[str, Any], validation: dict[str, Any], trace: list[dict[str, Any]], operator: CommandToolOperator) -> tuple[dict[str, Any], dict[str, Any]]:
    plan = job.get("plan") if isinstance(job.get("plan"), dict) else {}
    fingerprint = sample_fingerprint(sample, job["command_type"], str(plan.get("template_id", "")))
    intent = normalize_training_intent(str(sample["intent"]), plan)
    record = {
        "schema_version": "command-agent-sft-v1",
        "sample_id": f"cmd-{job_id:05d}",
        "plan_id": plan.get("plan_id"),
        "batch_id": plan.get("batch_id"),
        "primary_command_type": job["command_type"],
        "sample_mode": job["sample_mode"],
        "template_id": plan.get("template_id"),
        "scene_family": plan.get("scene_family"),
        "angle_id": plan.get("angle_id"),
        "plan_fingerprint": plan.get("plan_fingerprint"),
        "sample_fingerprint": fingerprint,
        "input": {"intent": intent, "asset_catalog": sample.get("asset_catalog", [])},
        "output": {"commands": sample["commands"]},
        "tool_trace": trace,
        "source_examples": sorted(set(operator.source_examples)),
        "validation": validation,
        "plan": plan,
    }
    return record, {"sample_id": record["sample_id"], "plan_id": record.get("plan_id"), "status": "success", "tool_calls": len(trace), "sample_fingerprint": fingerprint}


def job_plan_id(job: dict[str, Any]) -> str | None:
    plan_id = job.get("plan_id")
    if plan_id:
        return str(plan_id)
    plan = job.get("plan")
    if isinstance(plan, dict) and plan.get("plan_id"):
        return str(plan["plan_id"])
    return None


def run_job(
    job_id: int,
    job: dict[str, Any],
    database_path: Path,
    config: dict[str, Any],
    system: str,
    on_event: Callable[[dict[str, Any]], None] | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    operator = CommandToolOperator(CommandDatabase(database_path), job["command_type"], job["sample_mode"])
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps({
            "assigned_primary_command_type": job["command_type"],
            "sample_mode": job["sample_mode"],
            "variant_number": job["variant"],
            "plan": job.get("plan") or {
                "plan_id": f"legacy-{job['variant']}",
                "template_id": "legacy_unplanned",
                "intent_seed": f"Generate a diverse {job['sample_mode']} sample for {job['command_type']}",
            },
        }, ensure_ascii=False)},
    ]
    trace: list[dict[str, Any]] = []
    deadline = config.get("job_deadline")
    try:
        while len(trace) < config["max_actions"]:
            if deadline is not None and time.time() > float(deadline):
                raise RuntimeError(f"job wall timeout after {config.get('job_wall_seconds', '?')}s")
            json_envelope = config["tool_protocol"] == "json-envelope"
            response = call_teacher(config, messages, use_tools=not json_envelope)
            choices = response.get("choices") if isinstance(response, dict) else None
            if not isinstance(choices, list) or not choices:
                raise RuntimeError("teacher response has no choices")
            message = choices[0].get("message", {})
            content = message.get("content") or ""
            calls = message.get("tool_calls") or fallback_tool_call(content)
            if not calls:
                # Some providers return the completed sample as ordinary JSON
                # instead of a finish tool call. Validate locally and accept it.
                try:
                    sample = parse_json_object(content)
                    observation = operator.finish(sample)
                    trace.append({
                        "turn": len(trace) + 1,
                        "decision": {},
                        "tool": "direct_final_validation",
                        "arguments": {"sample": sample},
                        "observation": {"status": "ok", "summary": compact(observation)},
                    })
                    if on_event:
                        on_event(trace[-1])
                    if observation.get("accepted"):
                        return accepted_record(job_id, job, observation["sample"], observation["validation"], trace, operator)
                    raise RuntimeError(f"teacher direct sample failed validation: {compact(observation, 800)}")
                except (ValueError, json.JSONDecodeError) as error:
                    raise RuntimeError(f"teacher returned no tool call or valid sample: {str(content)[:800]}") from error
            # One completion may contain several calls; execute only one so the cap is
            # measured in actual tool actions and every action gets fresh evidence.
            calls = calls[:1]
            if json_envelope:
                messages.append({"role": "assistant", "content": content})
            else:
                messages.append({"role": "assistant", "content": content, "tool_calls": calls})
            for call in calls:
                function = call.get("function", {})
                name = function.get("name")
                arguments: dict[str, Any] = {}
                tool_decision: dict[str, str] = {}
                try:
                    arguments = json.loads(function.get("arguments", "{}"))
                    tool_decision = decision(arguments.pop("decision"))
                    if name == "get_command_contract":
                        observation = operator.get_command_contract(arguments["command_type"])
                    elif name == "find_command_examples":
                        observation = operator.find_command_examples(arguments.get("command_type", ""), arguments.get("query", ""), int(arguments.get("limit", 5)))
                    elif name == "get_command_context":
                        observation = operator.get_command_context(arguments["command_key"], int(arguments.get("before", 5)), int(arguments.get("after", 5)))
                    elif name == "get_level_metadata":
                        observation = operator.get_level_metadata(arguments["level_key"])
                    elif name == "validate_sample":
                        observation = operator.validate_sample(arguments["sample"])
                    elif name == "finish":
                        observation = operator.finish(arguments["sample"])
                    else:
                        raise ValueError(f"unknown tool: {name}")
                    status = "ok"
                except Exception as error:
                    observation = {"error": str(error)}
                    status = "error"
                trace.append({"turn": len(trace) + 1, "decision": tool_decision, "tool": name, "arguments": arguments, "observation": {"status": status, "summary": compact(observation)}})
                if on_event:
                    try:
                        on_event(trace[-1])
                    except Exception:
                        # Observability must not affect synthesis correctness.
                        pass
                if json_envelope:
                    messages.append({"role": "user", "content": json.dumps({"tool_result": {"tool": name, "result": observation}}, ensure_ascii=False)})
                else:
                    messages.append({"role": "tool", "tool_call_id": call.get("id", f"call-{len(trace)}"), "content": json.dumps(observation, ensure_ascii=False)})
                if status == "error":
                    continue
                if name == "validate_sample" and observation.get("valid"):
                    # A valid local runtime check is sufficient. Requiring the
                    # model to spend another turn calling finish was wasteful
                    # and caused valid direct JSON outputs to be discarded.
                    sample = arguments["sample"]
                    accepted = operator.finish(sample)
                    trace.append({
                        "turn": len(trace) + 1,
                        "decision": {},
                        "tool": "local_accept_after_validation",
                        "arguments": {"sample": sample},
                        "observation": {"status": "ok", "summary": compact(accepted)},
                    })
                    if on_event:
                        on_event(trace[-1])
                    if accepted.get("accepted"):
                        return accepted_record(job_id, job, accepted["sample"], accepted["validation"], trace, operator)
                if name == "finish" and observation.get("accepted"):
                    sample = observation["sample"]
                    return accepted_record(job_id, job, sample, observation["validation"], trace, operator)

        messages.append({
            "role": "user",
            "content": "Tool-action cap reached. Using the complete conversation and tool results above, now produce the best final sample. Do not call tools. Reply with ONLY the final sample JSON object matching the required schema; no Markdown, explanation, or wrapper.",
        })
        response = call_teacher(config, messages, use_tools=False)
        choices = response.get("choices") if isinstance(response, dict) else None
        if not isinstance(choices, list) or not choices:
            raise RuntimeError("teacher final response has no choices")
        final_content = choices[0].get("message", {}).get("content") or ""
        sample = parse_json_object(final_content)
        observation = operator.finish(sample)
        trace.append({
            "turn": len(trace) + 1,
            "decision": {},
            "tool": "forced_final_validation",
            "arguments": {"sample": sample},
            "observation": {"status": "ok", "summary": compact(observation)},
        })
        if observation.get("accepted"):
            return accepted_record(job_id, job, observation["sample"], observation["validation"], trace, operator)
        raise RuntimeError(f"max_actions={config['max_actions']} reached and forced final sample failed validation: {compact(observation, 800)}")
    except Exception as error:
        return None, {"sample_id": f"cmd-{job_id:05d}", "plan_id": job_plan_id(job), "status": "failed", "error": str(error), "tool_calls": len(trace)}


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Parallel tool-call synthesis of Vibe command mappings")
    sample_group = parser.add_mutually_exclusive_group(required=False)
    sample_group.add_argument("--samples", type=int, help="Total samples, distributed across command types")
    sample_group.add_argument("--per-command", type=int, help="Samples for every indexed command type")
    parser.add_argument("--workers", type=int, default=None, help="Parallel workers (default from VIBE_TEACHER_Cocurrency env or 4)")
    parser.add_argument("--project", default=str(REPO_ROOT / "customer-demo"))
    parser.add_argument("--api-base", default=os.getenv("VIBE_TEACHER_API_BASE", ""))
    parser.add_argument("--api-key", default=os.getenv("VIBE_TEACHER_API_KEY", ""))
    parser.add_argument("--model", default=os.getenv("VIBE_TEACHER_MODEL", ""))
    parser.add_argument("--max-tokens", type=int, default=int(os.getenv("VIBE_TEACHER_MAX_TOKENS", "1200")))
    parser.add_argument("--max-actions", type=int, default=int(os.getenv("VIBE_TEACHER_MAX_ACTIONS", "20")))
    parser.add_argument("--tool-protocol", choices=("openai", "json-envelope"), default=os.getenv("VIBE_TEACHER_TOOL_PROTOCOL", "openai"), help="Use json-envelope for endpoints that return tool calls as plain text")
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--plan", default=str(DEFAULT_PLAN_PATH), help="Global curriculum plan JSON")
    parser.add_argument("--plan-offset", type=int, default=0, help="Start slot in the global 1000-slot plan")
    parser.add_argument("--rebuild-plan", action="store_true", help="Rebuild the deterministic curriculum plan before running")
    parser.add_argument("--no-plan", action="store_true", help="Use legacy unplanned job scheduling")
    parser.add_argument("--retry-failed", default="", help="Path to a failed-slots.json from a previous run to re-attempt only failed plan slots")
    args = parser.parse_args()
    if not args.retry_failed and args.samples is None and args.per_command is None:
        parser.error("one of --samples, --per-command, or --retry-failed is required")
    # VIBE_TEACHER_Cocurrency wins over default; CLI --workers wins over everything.
    if args.workers is None:
        env_path_early = Path(os.getenv("VIBE_TEACHER_ENV_FILE", str(DEFAULT_ENV_PATH)))
        _early_env = read_env_file(env_path_early)
        _coc = _early_env.get("VIBE_TEACHER_Cocurrency") or os.environ.get("VIBE_TEACHER_Cocurrency")
        args.workers = int(_coc) if _coc and _coc.isdigit() else 4
    if args.workers < 1 or args.max_actions < 1 or (args.samples is not None and args.samples < 1) or (args.per_command is not None and args.per_command < 1):
        parser.error("workers, max-actions, and sample counts must be positive")
    if not args.dry_run:
        env_path = Path(os.getenv("VIBE_TEACHER_ENV_FILE", str(DEFAULT_ENV_PATH)))
        probe = collect_teacher_endpoints({**{k: v for k, v in os.environ.items() if k.startswith("VIBE_TEACHER_")}, **read_env_file(env_path)}, {"api_base": args.api_base, "api_key": args.api_key, "model": args.model})
        if not probe:
            parser.error("set teacher endpoints in agent-debugger/.env (VIBE_TEACHER_API_BASE/_KEY/_MODEL or _1.._4)")

    database_path = DEBUGGER / "state" / "command-index.sqlite"
    build_command_database(Path(args.project), database_path)
    database = CommandDatabase(database_path)
    plan_path = Path(args.plan)
    plan_meta: dict[str, Any] = {"enabled": False}
    if args.no_plan:
        jobs = make_jobs(database, args.samples, args.per_command)
    elif args.retry_failed:
        # Re-run only the plan slots that failed in a previous run.
        retry_path = Path(args.retry_failed)
        if not retry_path.exists():
            parser.error(f"--retry-failed file not found: {retry_path}")
        retry_data = json.loads(retry_path.read_text(encoding="utf-8"))
        failed_plan_ids = set(retry_data.get("failed_plan_ids_resolved") or retry_data.get("failed_plan_ids") or [])
        if not failed_plan_ids:
            print(json.dumps({"status": "nothing_to_retry", "file": str(retry_path)}, ensure_ascii=False))
            return 0
        if args.rebuild_plan or not plan_path.exists():
            plan = build_curriculum(database)
            save_curriculum(plan, plan_path)
        else:
            plan = load_curriculum(plan_path)
        slots = [slot for slot in plan["slots"] if slot["plan_id"] in failed_plan_ids]
        jobs = make_jobs_from_plan(slots)
        plan_meta = {
            "enabled": True,
            "mode": "retry_failed",
            "source_run": retry_data.get("run_id"),
            "plan_path": str(plan_path),
            "plan_slots": [slot["plan_id"] for slot in slots],
            "batch_ids": sorted({slot["batch_id"] for slot in slots}),
        }
    else:
        if args.rebuild_plan or not plan_path.exists():
            plan = build_curriculum(database)
            save_curriculum(plan, plan_path)
        else:
            plan = load_curriculum(plan_path)
        if args.per_command is not None:
            # Keep CLI compatibility: expand per-command without the global plan lattice.
            jobs = make_jobs(database, None, args.per_command)
            plan_meta = {"enabled": False, "reason": "per-command mode uses legacy scheduling"}
        else:
            assert args.samples is not None
            slots = slice_plan(plan, args.plan_offset, args.samples)
            jobs = make_jobs_from_plan(slots)
            plan_meta = {
                "enabled": True,
                "plan_path": str(plan_path),
                "plan_offset": args.plan_offset,
                "plan_slots": [slot["plan_id"] for slot in slots],
                "batch_ids": sorted({slot["batch_id"] for slot in slots}),
            }
    run_id = datetime.now().strftime("command-agent-%Y%m%d-%H%M%S")
    run_dir = DEBUGGER / "runs" / "command-agent" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    if args.dry_run:
        write_json(run_dir / "manifest.json", {"run_id": run_id, "status": "dry_run", "workers": args.workers, "job_count": len(jobs), "jobs": jobs, "plan": plan_meta})
        print(json.dumps({"run_dir": str(run_dir), "status": "dry_run", "job_count": len(jobs), "workers": args.workers, "plan": plan_meta}, ensure_ascii=False))
        return 0

    shared = {
        "max_tokens": args.max_tokens,
        "max_actions": args.max_actions,
        "temperature": args.temperature,
        "timeout": args.timeout,
        "tool_protocol": args.tool_protocol,
        "api_retries": int(os.getenv("VIBE_TEACHER_API_RETRIES", "2")),
        "api_retry_backoff": float(os.getenv("VIBE_TEACHER_API_RETRY_BACKOFF", "1.5")),
        "job_wall_seconds": int(os.getenv("VIBE_TEACHER_JOB_WALL_SECONDS", "240")),
    }
    cli_endpoint = {"api_base": args.api_base, "api_key": args.api_key, "model": args.model}
    env_path = Path(os.getenv("VIBE_TEACHER_ENV_FILE", str(DEFAULT_ENV_PATH)))
    teacher_store = TeacherConfigStore(env_path, shared, cli_endpoint)
    endpoint_snapshot = teacher_store.endpoints_snapshot()
    system = static_prompt(args.tool_protocol)
    records: list[dict[str, Any]] = []
    states: list[dict[str, Any]] = []
    seen_fingerprints: set[str] = set()
    corpus_dir = REPO_ROOT / "training-data" / "command-agent-sft"
    output = corpus_dir / f"{run_id}.jsonl"
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    output.touch()
    # Seed fingerprints from prior accepted corpora so batch0..batch9 stay non-overlapping.
    if corpus_dir.exists():
        for path in corpus_dir.glob("*.jsonl"):
            if path == output:
                continue
            for line in path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                try:
                    prior = json.loads(line)
                except json.JSONDecodeError:
                    continue
                fingerprint = prior.get("sample_fingerprint")
                if not fingerprint and isinstance(prior.get("output"), dict):
                    fingerprint = sample_fingerprint(
                        {
                            "intent": (prior.get("input") or {}).get("intent", ""),
                            "commands": (prior.get("output") or {}).get("commands", []),
                        },
                        str(prior.get("primary_command_type", "")),
                        str(prior.get("template_id", "")),
                    )
                if fingerprint:
                    seen_fingerprints.add(str(fingerprint))
    lock = threading.Lock()

    def persist_manifest(partial: bool = False) -> dict[str, Any]:
        failed_states = [state for state in states if state.get("status") == "failed"]
        manifest = {
            "run_id": run_id,
            "workers": args.workers,
            "requested_samples": len(jobs),
            "accepted_samples": len(records),
            "failed_samples": len(failed_states),
            "output": str(output.relative_to(REPO_ROOT)),
            "plan": plan_meta,
            "env_path": str(env_path),
            "teacher_endpoints": [
                {"slot": item["slot"], "api_base": item["api_base"], "model": item["model"], "api_key_set": bool(item.get("api_key"))}
                for item in teacher_store.endpoints_snapshot()
            ],
            "unique_fingerprints": len({record.get("sample_fingerprint") for record in records if record.get("sample_fingerprint")}),
            "partial": partial,
            "states": list(states),
            "failed_plan_ids": [state.get("plan_id") for state in failed_states if state.get("plan_id")],
            "failed_plan_ids_resolved": [state.get("plan_id") for state in failed_states if state.get("plan_id")],
            "failed_sample_ids": [state.get("sample_id") for state in failed_states],
        }
        write_json(run_dir / "manifest.json", manifest)
        write_json(run_dir / "failed-slots.json", {
            "run_id": run_id,
            "failed_plan_ids": manifest["failed_plan_ids"],
            "failed_plan_ids_resolved": manifest["failed_plan_ids_resolved"],
            "failed_sample_ids": manifest["failed_sample_ids"],
            "states": failed_states,
        })
        return manifest

    def worker(worker_id: int, indexed_jobs: list[tuple[int, dict[str, Any]]]) -> None:
        local_states: list[dict[str, Any]] = []
        for job_id, job in indexed_jobs:
            try:
                # Sticky primary first; on failure rotate across all live endpoints before giving up.
                configs = teacher_store.configs_for_failover(worker_id)
                if not configs:
                    raise RuntimeError("no teacher endpoints available after env reload")
                record = None
                state: dict[str, Any] = {}
                attempts: list[dict[str, Any]] = []
                job_wall = int((configs[0] if configs else {}).get("job_wall_seconds") or shared.get("job_wall_seconds") or 420)
                job_deadline = time.time() + max(60, job_wall)
                for attempt_index, config in enumerate(configs, 1):
                    if time.time() > job_deadline:
                        state = {
                            "sample_id": f"cmd-{job_id:05d}",
                            "plan_id": job_plan_id(job),
                            "status": "failed",
                            "error": f"job wall timeout after {job_wall}s before endpoint attempt {attempt_index}",
                            "tool_calls": 0,
                        }
                        attempts.append({
                            "endpoint_slot": config.get("endpoint_slot"),
                            "model": config.get("model"),
                            "status": "failed",
                            "error": state["error"],
                            "tool_calls": 0,
                        })
                        break
                    config = dict(config)
                    config["job_deadline"] = job_deadline
                    config["job_wall_seconds"] = job_wall
                    # Keep remaining wall time as request timeout upper bound so a single SSL read cannot outlive the job.
                    remaining = max(15, int(job_deadline - time.time()))
                    config["timeout"] = min(int(config.get("timeout") or 120), remaining)
                    candidate_record, candidate_state = run_job(job_id, job, database_path, config, system)
                    candidate_state = dict(candidate_state)
                    candidate_state["endpoint_slot"] = config.get("endpoint_slot")
                    candidate_state["model"] = config.get("model")
                    candidate_state["failover_attempt"] = attempt_index
                    attempts.append({
                        "endpoint_slot": config.get("endpoint_slot"),
                        "model": config.get("model"),
                        "status": candidate_state.get("status"),
                        "error": candidate_state.get("error"),
                        "tool_calls": candidate_state.get("tool_calls", 0),
                    })
                    if candidate_record:
                        fingerprint = str(candidate_record.get("sample_fingerprint") or "")
                        with lock:
                            if fingerprint and fingerprint in seen_fingerprints:
                                candidate_state = {
                                    "sample_id": candidate_record["sample_id"],
                                    "plan_id": candidate_record.get("plan_id"),
                                    "status": "failed",
                                    "error": f"duplicate sample fingerprint: {fingerprint}",
                                    "tool_calls": candidate_state.get("tool_calls", 0),
                                    "sample_fingerprint": fingerprint,
                                    "endpoint_slot": config.get("endpoint_slot"),
                                    "model": config.get("model"),
                                    "failover_attempt": attempt_index,
                                }
                                attempts[-1] = {
                                    "endpoint_slot": config.get("endpoint_slot"),
                                    "model": config.get("model"),
                                    "status": "failed",
                                    "error": candidate_state["error"],
                                    "tool_calls": candidate_state.get("tool_calls", 0),
                                }
                                # Duplicate is corpus-level; do not burn more endpoints.
                                record = None
                                state = candidate_state
                                break
                            if fingerprint:
                                seen_fingerprints.add(fingerprint)
                        record = dict(candidate_record)
                        record["endpoint_slot"] = config.get("endpoint_slot")
                        record["teacher_model"] = config.get("model")
                        record["failover_attempt"] = attempt_index
                        if len(attempts) > 1:
                            record["failover_attempts"] = attempts
                        state = candidate_state
                        if len(attempts) > 1:
                            state["failover_attempts"] = attempts
                        break
                    state = candidate_state
                    # Try next endpoint for the same plan slot.
                    continue
                if not record:
                    state = dict(state or {
                        "sample_id": f"cmd-{job_id:05d}",
                        "plan_id": job_plan_id(job),
                        "status": "failed",
                        "error": "all endpoints failed",
                        "tool_calls": 0,
                    })
                    if not state.get("plan_id"):
                        state["plan_id"] = job_plan_id(job)
                    state["status"] = "failed"
                    state["failover_attempts"] = attempts
                    if attempts:
                        state["endpoint_slot"] = attempts[-1].get("endpoint_slot")
                        state["model"] = attempts[-1].get("model")
                        errors = [str(item.get("error") or "") for item in attempts if item.get("error")]
                        if errors:
                            state["error"] = " | ".join(errors)[:1200]
                local_states.append(state)
                write_json(run_dir / f"worker-{worker_id:02d}.json", {
                    "worker_id": worker_id,
                    "endpoint_slot": (configs[0].get("endpoint_slot") if configs else None),
                    "updated_at": datetime.now().isoformat(),
                    "samples": local_states,
                })
                with lock:
                    states.append(state)
                    if record:
                        records.append(record)
                        # Incremental durability: each accepted sample is flushed immediately.
                        append_jsonl(output, record)
                    persist_manifest(partial=True)
            except Exception as worker_err:
                err_state = {"sample_id": f"cmd-{job_id:05d}", "plan_id": job_plan_id(job), "status": "failed", "error": f"worker_exception: {worker_err}", "tool_calls": 0}
                local_states.append(err_state)
                write_json(run_dir / f"worker-{worker_id:02d}.json", {
                    "worker_id": worker_id,
                    "endpoint_slot": None,
                    "updated_at": datetime.now().isoformat(),
                    "samples": local_states,
                })
                with lock:
                    states.append(err_state)
                    persist_manifest(partial=True)

    indexed = list(enumerate(jobs, 1))
    buckets = [indexed[index::args.workers] for index in range(args.workers)]
    print(json.dumps({
        "run_dir": str(run_dir),
        "status": "starting",
        "workers": args.workers,
        "job_count": len(jobs),
        "output": str(output.relative_to(REPO_ROOT)),
        "teacher_endpoints": [
            {"slot": item["slot"], "api_base": item["api_base"], "model": item["model"]}
            for item in endpoint_snapshot
        ],
        "plan": plan_meta,
    }, ensure_ascii=False), flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(worker, index, bucket) for index, bucket in enumerate(buckets)]
        for future in futures:
            future.result()

    # Rewrite sorted jsonl for stable downstream consumption while keeping incremental safety during the run.
    records.sort(key=lambda item: item["sample_id"])
    output.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8")
    manifest = persist_manifest(partial=False)
    print(json.dumps({
        "run_dir": str(run_dir),
        **{key: manifest[key] for key in ("requested_samples", "accepted_samples", "failed_samples", "output")},
        "teacher_endpoints": manifest.get("teacher_endpoints"),
        "failed_plan_ids": manifest.get("failed_plan_ids"),
    }, ensure_ascii=False))
    return 0 if manifest["accepted_samples"] == manifest["requested_samples"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
