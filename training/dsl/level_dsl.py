#!/usr/bin/env python3
"""Lossless-enough compact authoring DSL for Vibe level patches.

The model emits only executable behavior. ``intent`` and ``asset_catalog`` are
request context, so the caller injects them when compiling the DSL back to the
editor's four-field JSON patch.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Iterable


INDENT = 4
OPERATORS = {
    "=": "set", "+": "add", "-": "sub", "*": "mul", "/": "div",
    "==": "eq", "!=": "ne", ">": "gt", "<": "lt", ">=": "gte", "<=": "lte",
}
CONDITION_OPERATORS = {"eq", "ne", "gt", "lt", "gte", "lte", "in", "contains"}


@dataclass(frozen=True)
class CommandSpec:
    alias: str
    command_type: str
    positional: tuple[str, ...] = ()
    block_field: str | None = None


SPECS = (
    CommandSpec("VAR", "SET_VARIABLE", ("key", "op", "value")),
    CommandSpec("SWITCH", "SET_SWITCH", ("key", "value")),
    CommandSpec("WAIT", "WAIT", ("duration",)),
    CommandSpec("JUMP", "JUMP_TO", ("target",)),
    CommandSpec("SIGNAL", "EMIT_SIGNAL", ("signal",)),
    CommandSpec("LOOP", "LOOP", (), "commands"),
    CommandSpec("BREAK", "BREAK"),
    CommandSpec("CONTINUE", "CONTINUE"),
    CommandSpec("RETURN", "RETURN"),
    CommandSpec("IMAGE", "SHOW_IMAGE", ("elementId", "resourceId")),
    CommandSpec("TEXT", "SHOW_TEXT", ("elementId", "text")),
    CommandSpec("TEXT_SET", "UPDATE_TEXT", ("elementId", "text")),
    CommandSpec("BUTTON", "SHOW_CHOICES", ("elementId", "text")),
    CommandSpec("MEDIA", "SHOW_MEDIA", ("elementId", "mediaType", "resourceId")),
    CommandSpec("CHOICES", "SHOW_CHOICES", ("elementId",), "options"),
    CommandSpec("STYLE", "SET_ELEMENT_STYLE", ("elementId", "style")),
    CommandSpec("MOVE", "MOVE_TO", ("elementId", "x", "y")),
    CommandSpec("FLIP", "FLIP_CARD", ("elementId", "backResourceId")),
    CommandSpec("CLICK", "SET_CLICKABLE", ("elementId",), "commands"),
    CommandSpec("SELECT", "SET_SELECTABLE", ("elementId",), "onSelectedCommands"),
    CommandSpec("DRAG", "SET_DRAGGABLE", ("elementId",)),
    CommandSpec("AREA", "CHECK_IN_AREA", ("elementId", "x", "y", "width", "height"), "commands"),
    CommandSpec("SELECT_STATE", "CHANGE_SELECTED_STATE", ("elementId", "selected")),
    CommandSpec("ANIM_IN", "ANIMATE_IN", ("elementId", "preset")),
    CommandSpec("ANIM_LOOP", "ANIMATE_LOOP", ("elementId", "loopType")),
    CommandSpec("ANIM_OUT", "ANIMATE_OUT", ("elementId", "preset")),
    CommandSpec("ANIM_STOP", "STOP_ANIMATION", ("elementId",)),
    CommandSpec("FIREWORK", "FIREWORK_BURST"),
    CommandSpec("BGM", "BGM_PLAY", ("musicId",)),
    CommandSpec("BGM_PAUSE", "BGM_PAUSE"),
    CommandSpec("BGM_STOP", "BGM_STOP"),
    CommandSpec("SE", "SE_PLAY", ("soundId",)),
    CommandSpec("SE_STOP", "SE_STOP"),
    CommandSpec("VOLUME", "SET_VOLUME", ("target", "volume")),
    CommandSpec("NEXT", "NEXT_LEVEL"),
    CommandSpec("SCENE", "SCENE_REDIRECT", ("url",)),
)
BY_ALIAS = {spec.alias: spec for spec in SPECS}
BY_TYPE = {spec.command_type: spec for spec in SPECS}
GENERIC_ALLOWED_TYPES = {
    "SET_USER_DATA", "ADD_SCORE", "PLAY_SOUND", "SET_POSITION", "GET_POSITION",
    "CREATE_DROP_ZONE",
}

OPTION_ALIASES: dict[str, dict[str, str]] = {
    "SHOW_IMAGE": {"x": "position.x", "y": "position.y", "w": "size.width", "h": "size.height", "z": "zIndex", "vis": "visible", "parent": "parentId", "rot": "rotation"},
    "SHOW_TEXT": {"x": "position.x", "y": "position.y", "z": "zIndex", "block": "blocking", "dismiss": "dismissOnContinue", "skin": "skinId", "pad": "padding", "vis": "visible"},
    "SHOW_CHOICES": {"x": "position.x", "y": "position.y", "block": "blocking", "multi": "multiSelect", "skin": "ui.buttonSkinId", "selectedSkin": "ui.selectedSkinId"},
    "MOVE_TO": {"ms": "duration", "rel": "relative", "keep": "keepOnMinusOne"},
    "ANIMATE_IN": {"ms": "duration", "dir": "direction"},
    "ANIMATE_LOOP": {"ms": "duration"},
    "ANIMATE_OUT": {"ms": "duration", "dir": "direction", "hide": "hideAfter"},
    "BGM_PLAY": {"vol": "volume", "loop": "loop", "fade": "fadeIn"},
    "BGM_STOP": {"fade": "fadeOut"},
    "SE_PLAY": {"vol": "volume", "loop": "loop", "fade": "fadeIn", "delay": "delay", "interrupt": "interrupt"},
    "SET_CLICKABLE": {"enabled": "clickable", "block": "blocking", "action": "onClick", "front": "frontResourceId", "back": "backResourceId", "showBack": "showBack"},
    "SET_SELECTABLE": {"enabled": "selectable", "var": "variableKey", "single": "singleSelect", "overlay": "overlayResourceId"},
    "SET_DRAGGABLE": {"enabled": "draggable"},
    "CHECK_IN_AREA": {"mode": "triggerMode", "enter": "requireEnter", "outside": "outside"},
    "SCENE_REDIRECT": {"level": "levelIndex"},
}
REVERSE_OPTION_ALIASES = {
    command_type: {path: alias for alias, path in aliases.items()}
    for command_type, aliases in OPTION_ALIASES.items()
}


class DslError(ValueError):
    def __init__(self, line: int, message: str):
        super().__init__(f"line {line}: {message}")
        self.line = line
        self.message = message


@dataclass
class SourceLine:
    number: int
    indent: int
    text: str


def _lex(text: str, line_number: int) -> list[str]:
    tokens: list[str] = []
    start = 0
    depth = 0
    quote = ""
    escaped = False
    for index, char in enumerate(text):
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = ""
            continue
        if char in {'"', "'"}:
            quote = char
        elif char in "[{":
            depth += 1
        elif char in "]}":
            depth -= 1
            if depth < 0:
                raise DslError(line_number, "unbalanced closing bracket")
        elif char.isspace() and depth == 0:
            if start < index:
                tokens.append(text[start:index])
            start = index + 1
    if quote:
        raise DslError(line_number, "unterminated string")
    if depth:
        raise DslError(line_number, "unbalanced JSON value")
    if start < len(text):
        tokens.append(text[start:])
    return tokens


def _value(token: str, line_number: int) -> Any:
    if token.startswith(('"', "'")):
        if token.startswith("'"):
            token = json.dumps(token[1:-1], ensure_ascii=False)
        try:
            return json.loads(token)
        except json.JSONDecodeError as error:
            raise DslError(line_number, f"invalid quoted value: {error.msg}") from error
    is_json_container = (token.startswith("{") and token.endswith("}")) or (token.startswith("[") and token.endswith("]"))
    if is_json_container or token in {"true", "false", "null"} or re.fullmatch(r"-?(?:0|[1-9]\d*)(?:\.\d+)?", token):
        try:
            return json.loads(token)
        except json.JSONDecodeError as error:
            raise DslError(line_number, f"invalid JSON value: {error.msg}") from error
    return token


def _set_path(target: dict[str, Any], path: str, value: Any) -> None:
    cursor = target
    parts = path.split(".")
    for part in parts[:-1]:
        child = cursor.get(part)
        if not isinstance(child, dict):
            child = {}
            cursor[part] = child
        cursor = child
    cursor[parts[-1]] = value


def _pop_path(target: dict[str, Any], path: str) -> tuple[bool, Any]:
    cursor = target
    parts = path.split(".")
    for part in parts[:-1]:
        child = cursor.get(part)
        if not isinstance(child, dict):
            return False, None
        cursor = child
    if parts[-1] not in cursor:
        return False, None
    value = cursor.pop(parts[-1])
    for part in reversed(parts[:-1]):
        parent = target
        for step in parts[:parts.index(part)]:
            parent = parent[step]
        if isinstance(parent.get(part), dict) and not parent[part]:
            parent.pop(part)
    return True, value


def _format_value(value: Any) -> str:
    if (
        isinstance(value, str)
        and re.fullmatch(r"[A-Za-z0-9_./:@{}$+-]+", value)
        and value not in {"true", "false", "null"}
        and not re.fullmatch(r"-?(?:0|[1-9]\d*)(?:\.\d+)?", value)
    ):
        return value
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _source_lines(text: str) -> list[SourceLine]:
    result: list[SourceLine] = []
    for number, raw in enumerate(text.splitlines(), start=1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if "\t" in raw[: len(raw) - len(raw.lstrip())]:
            raise DslError(number, "tabs are not allowed; indent with four spaces")
        spaces = len(raw) - len(raw.lstrip(" "))
        if spaces % INDENT:
            raise DslError(number, "indentation must be a multiple of four spaces")
        result.append(SourceLine(number, spaces // INDENT, raw.strip()))
    return result


class Parser:
    def __init__(self, text: str):
        self.lines = _source_lines(text)
        self.index = 0
        self.command_index = 0
        self.event_index = 0
        self.ids: set[str] = set()
        self.labels: dict[str, str] = {}
        self.external_jump_ids: set[str] = set()

    def parse(self) -> dict[str, Any]:
        commands: list[dict[str, Any]] = []
        events: list[dict[str, Any]] = []
        while self.index < len(self.lines):
            line = self.lines[self.index]
            if line.indent != 0:
                raise DslError(line.number, "top-level line must not be indented")
            head = _lex(line.text, line.number)[0].upper()
            if head in {"ON", "AUTO", "EVENT"}:
                events.append(self._event())
            else:
                commands.extend(self._commands(0, stop_at_event=True))
        self._validate_jump_targets(commands, events)
        return {"commands": commands, "extra_events": events}

    def _commands(self, indent: int, *, stop_at_event: bool = False) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        pending_label: tuple[str, int] | None = None
        while self.index < len(self.lines):
            line = self.lines[self.index]
            if line.indent < indent:
                break
            if line.indent > indent:
                if pending_label:
                    raise DslError(pending_label[1], "LABEL must be followed by a command at the same indentation")
                raise DslError(line.number, "unexpected indentation")
            tokens = _lex(line.text, line.number)
            head = tokens[0].upper()
            if head in {"ELSE", "OPTION", "CANCEL"}:
                break
            if stop_at_event and head in {"ON", "AUTO", "EVENT"}:
                break
            if head == "LABEL":
                if len(tokens) != 2:
                    raise DslError(line.number, "LABEL requires exactly one name")
                label = str(_value(tokens[1], line.number))
                if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.-]*", label):
                    raise DslError(line.number, "LABEL name must be an identifier")
                if label in self.labels or pending_label:
                    raise DslError(line.number, f"duplicate or consecutive LABEL {label}")
                pending_label = (label, line.number)
                self.index += 1
                continue
            command, block_field = self._command(tokens, line)
            if pending_label:
                label, label_line = pending_label
                self.labels[label] = command["id"]
                pending_label = None
            self.index += 1
            if command["type"] == "IF_CONDITION":
                command["parameters"]["trueCommands"] = self._required_child(indent, line, "IF")
                command["parameters"]["falseCommands"] = []
                if self.index < len(self.lines):
                    else_line = self.lines[self.index]
                    if else_line.indent == indent and else_line.text.upper() == "ELSE":
                        self.index += 1
                        command["parameters"]["falseCommands"] = self._required_child(indent, else_line, "ELSE")
            elif command["type"] == "SHOW_CHOICES" and head == "CHOICES":
                command["parameters"]["options"] = self._options(indent, line)
            elif block_field:
                has_child = self.index < len(self.lines) and self.lines[self.index].indent == indent + 1
                if has_child:
                    child = self._commands(indent + 1)
                    command["parameters"][block_field] = child
                    if command["type"] == "SET_CLICKABLE":
                        command["parameters"].setdefault("onClick", "commands")
                elif command["type"] not in {"SET_CLICKABLE", "SET_SELECTABLE"}:
                    raise DslError(line.number, f"{head} requires an indented command block")
            previous = result[-1] if result else None
            if (
                command["type"] == "SET_CLICKABLE"
                and previous
                and previous["parameters"].get("__dslButton") is True
                and previous["parameters"].get("elementId") == command["parameters"].get("elementId")
                and command["parameters"].get("onClick", "commands") == "commands"
            ):
                previous["parameters"]["options"][0]["commands"] = command["parameters"].get("commands", [])
                if "blocking" in command["parameters"]:
                    previous["parameters"]["blocking"] = command["parameters"]["blocking"]
                previous["parameters"].pop("__dslButton", None)
                self.ids.discard(command["id"])
                for label, target in list(self.labels.items()):
                    if target == command["id"]:
                        self.labels[label] = previous["id"]
            else:
                if previous:
                    previous["parameters"].pop("__dslButton", None)
                result.append(command)
        if pending_label:
            raise DslError(pending_label[1], "LABEL must be followed by a command at the same indentation")
        if result and result[-1]["parameters"].get("__dslButton") is True:
            result[-1]["parameters"].pop("__dslButton", None)
        return result

    def _required_child(self, indent: int, parent: SourceLine, label: str) -> list[dict[str, Any]]:
        if self.index >= len(self.lines) or self.lines[self.index].indent != indent + 1:
            raise DslError(parent.number, f"{label} requires an indented command block")
        return self._commands(indent + 1)

    def _options(self, indent: int, parent: SourceLine) -> list[dict[str, Any]]:
        if self.index >= len(self.lines) or self.lines[self.index].indent != indent + 1:
            raise DslError(parent.number, "CHOICES requires at least one OPTION")
        options: list[dict[str, Any]] = []
        while self.index < len(self.lines) and self.lines[self.index].indent == indent + 1:
            line = self.lines[self.index]
            tokens = _lex(line.text, line.number)
            if not tokens or tokens[0].upper() != "OPTION" or len(tokens) < 3:
                raise DslError(line.number, "CHOICES children must be OPTION id text")
            option = {"id": str(_value(tokens[1], line.number)), "text": str(_value(tokens[2], line.number))}
            self._apply_options(option, tokens[3:], line.number, None)
            self.index += 1
            if self.index < len(self.lines) and self.lines[self.index].indent == indent + 2:
                option["commands"] = self._commands(indent + 2)
            options.append(option)
        return options

    def _event(self) -> dict[str, Any]:
        line = self.lines[self.index]
        tokens = _lex(line.text, line.number)
        kind = tokens.pop(0).upper()
        self.event_index += 1
        event: dict[str, Any] = {"id": f"dsl_event_{self.event_index:03d}", "name": "", "triggers": [], "commands": []}
        if kind == "ON":
            if not tokens:
                raise DslError(line.number, "ON requires a signal")
            signal = str(_value(tokens.pop(0), line.number))
            event["name"] = str(_value(tokens.pop(0), line.number)) if tokens and "=" not in tokens[0] else signal
            event["triggers"] = [{"type": "custom", "target": signal}]
        elif kind == "AUTO":
            event["name"] = str(_value(tokens.pop(0), line.number)) if tokens and "=" not in tokens[0] else "自动事件"
            event["triggers"] = [{"type": "auto", "start": "immediate"}]
        else:
            event["name"] = str(_value(tokens.pop(0), line.number)) if tokens and "=" not in tokens[0] else "事件"
        self._apply_options(event, tokens, line.number, None)
        if not event.get("triggers"):
            raise DslError(line.number, "EVENT requires triggers=[...]")
        self.index += 1
        event["commands"] = self._required_child(0, line, kind)
        return event

    def _command(self, tokens: list[str], line: SourceLine) -> tuple[dict[str, Any], str | None]:
        explicit_id: str | None = None
        if tokens[0].startswith("@"):
            explicit_id = tokens.pop(0)[1:]
            if not explicit_id:
                raise DslError(line.number, "empty command label")
        if not tokens:
            raise DslError(line.number, "missing command")
        alias = tokens.pop(0).upper()
        if alias == "IF":
            command = self._new_command("IF_CONDITION", explicit_id, line.number)
            command["parameters"] = {"condition": self._condition(tokens, line.number)}
            return command, "trueCommands"
        if alias == "IFEXPR":
            if len(tokens) != 1:
                raise DslError(line.number, "IFEXPR requires one quoted expression")
            command = self._new_command("IF_CONDITION", explicit_id, line.number)
            command["parameters"] = {"condition": {"type": "expression", "expression": _value(tokens[0], line.number)}}
            return command, "trueCommands"
        if alias == "JUMP_ID":
            if len(tokens) != 1:
                raise DslError(line.number, "JUMP_ID requires one existing runtime command id")
            target = str(_value(tokens[0], line.number))
            self.external_jump_ids.add(target)
            command = self._new_command("JUMP_TO", explicit_id, line.number)
            command["parameters"] = {"target": target}
            return command, None
        if alias == "CMD":
            if not tokens:
                raise DslError(line.number, "CMD requires a runtime command type")
            command_type = str(tokens.pop(0)).upper()
            if command_type not in GENERIC_ALLOWED_TYPES:
                raise DslError(line.number, f"CMD type is not in the safe DSL allowlist: {command_type}")
            command = self._new_command(command_type, explicit_id, line.number)
            self._apply_options(command["parameters"], tokens, line.number, command_type)
            block_field = str(command["parameters"].pop("block", "")) or None
            return command, block_field
        spec = BY_ALIAS.get(alias)
        if not spec:
            raise DslError(line.number, f"unknown command {alias}")
        command = self._new_command(spec.command_type, explicit_id, line.number)
        params = command["parameters"]
        if alias == "VAR":
            if len(tokens) < 3:
                raise DslError(line.number, "VAR requires key operator value")
            params["key"] = _value(tokens.pop(0), line.number)
            raw_operator = tokens.pop(0)
            params["op"] = OPERATORS.get(raw_operator, raw_operator)
            params["value"] = _value(tokens.pop(0), line.number)
        elif alias == "LOOP" and tokens and "=" not in tokens[0]:
            params["loopType"] = "while"
            params["condition"] = self._condition(tokens, line.number)
            tokens = []
        elif alias == "BREAK" and tokens and "=" not in tokens[0]:
            params["condition"] = self._condition(tokens, line.number)
            tokens = []
        elif alias == "AREA":
            if len(tokens) < 5:
                raise DslError(line.number, "AREA requires elementId x y width height")
            params["elementId"] = _value(tokens.pop(0), line.number)
            params["area"] = {name: _value(tokens.pop(0), line.number) for name in ("x", "y", "width", "height")}
        else:
            for field in spec.positional:
                if not tokens or "=" in tokens[0]:
                    raise DslError(line.number, f"{alias} requires {field}")
                params[field] = _value(tokens.pop(0), line.number)
        if alias == "VAR":
            params["op"] = OPERATORS.get(str(params["op"]), str(params["op"]))
        self._apply_options(params, tokens, line.number, spec.command_type)
        if alias == "BUTTON":
            text = params.pop("text")
            params["options"] = [{"id": str(params["elementId"]), "text": str(text)}]
            params["__dslButton"] = True
        return command, spec.block_field

    def _new_command(self, command_type: str, explicit_id: str | None, line_number: int) -> dict[str, Any]:
        self.command_index += 1
        command_id = explicit_id or f"dsl_{self.command_index:04d}_{command_type.lower()}"
        if command_id in self.ids:
            raise DslError(line_number, f"duplicate command id {command_id}")
        self.ids.add(command_id)
        return {"id": command_id, "type": command_type, "parameters": {}}

    def _condition(self, tokens: list[str], line_number: int) -> dict[str, Any]:
        if len(tokens) != 3:
            raise DslError(line_number, "condition must be: variable operator value")
        key = str(_value(tokens[0], line_number))
        operator = OPERATORS.get(tokens[1], tokens[1])
        if operator not in CONDITION_OPERATORS:
            raise DslError(line_number, f"unsupported condition operator {tokens[1]}")
        return {"type": "variable", "key": key, "operator": operator, "value": _value(tokens[2], line_number)}

    def _apply_options(self, target: dict[str, Any], tokens: Iterable[str], line_number: int, command_type: str | None) -> None:
        aliases = OPTION_ALIASES.get(command_type or "", {})
        for token in tokens:
            if "=" not in token:
                raise DslError(line_number, f"optional argument must use key=value: {token}")
            key, raw = token.split("=", 1)
            if not key or not raw:
                raise DslError(line_number, f"invalid option {token}")
            _set_path(target, aliases.get(key, key), _value(raw, line_number))

    def _validate_jump_targets(self, commands: list[dict[str, Any]], events: list[dict[str, Any]]) -> None:
        for command in walk_commands(commands, events):
            if command.get("type") == "JUMP_TO":
                params = command.get("parameters") or {}
                target = params.get("target")
                if target in self.labels:
                    target = params["target"] = self.labels[target]
                if target not in self.ids and target not in self.external_jump_ids:
                    raise DslError(0, f"JUMP target does not exist: {target}")


def walk_commands(commands: list[dict[str, Any]], events: list[dict[str, Any]] | None = None) -> Iterable[dict[str, Any]]:
    for command in commands or []:
        yield command
        params = command.get("parameters") or {}
        for field in ("commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands"):
            yield from walk_commands(params.get(field) or [])
        for option in params.get("options") or []:
            if isinstance(option, dict):
                yield from walk_commands(option.get("commands") or [])
    for event in events or []:
        yield from walk_commands(event.get("commands") or [])


def parse_program(text: str) -> dict[str, Any]:
    return Parser(text).parse()


def compile_patch(text: str, *, intent: str, asset_catalog: list[dict[str, Any]]) -> dict[str, Any]:
    program = parse_program(text)
    return {"intent": intent, "asset_catalog": asset_catalog, **program}


def _condition_text(condition: Any) -> str | None:
    if not isinstance(condition, dict):
        return None
    if condition.get("type") == "variable" and condition.get("operator") in CONDITION_OPERATORS and isinstance(condition.get("key"), str):
        reverse = {value: key for key, value in OPERATORS.items() if value in CONDITION_OPERATORS}
        operator = reverse.get(condition["operator"], condition["operator"])
        return f"{_format_value(condition['key'])} {operator} {_format_value(condition.get('value'))}"
    return None


class Serializer:
    def __init__(self, patch: dict[str, Any]):
        self.patch = patch
        self.command_ids = {
            str(command.get("id"))
            for command in walk_commands(patch.get("commands") or [], patch.get("extra_events") or [])
            if command.get("id")
        }
        self.jump_targets = {
            str((command.get("parameters") or {}).get("target"))
            for command in walk_commands(patch.get("commands") or [], patch.get("extra_events") or [])
            if command.get("type") == "JUMP_TO" and (command.get("parameters") or {}).get("target")
        }
        internal_targets = self.jump_targets & self.command_ids
        self.labels = {target: f"L{index}" for index, target in enumerate(sorted(internal_targets), start=1)}

    def serialize(self) -> str:
        lines = self._commands(self.patch.get("commands") or [], 0)
        for event in self.patch.get("extra_events") or []:
            if lines:
                lines.append("")
            lines.extend(self._event(event))
        return "\n".join(lines).rstrip() + "\n"

    def _event(self, event: dict[str, Any]) -> list[str]:
        triggers = event.get("triggers") or []
        name = str(event.get("name") or "事件")
        options: dict[str, Any] = {}
        if event.get("conditions") is not None:
            options["conditions"] = event["conditions"]
        if len(triggers) == 1 and triggers[0].get("type") == "custom" and triggers[0].get("target"):
            head = f"ON {_format_value(triggers[0]['target'])} {_format_value(name)}"
        elif len(triggers) == 1 and triggers[0].get("type") == "auto" and triggers[0].get("start") == "immediate":
            head = f"AUTO {_format_value(name)}"
        else:
            options["triggers"] = triggers
            head = f"EVENT {_format_value(name)}"
        head += self._options(options, None)
        return [head, *self._commands(event.get("commands") or [], 1)]

    def _commands(self, commands: list[dict[str, Any]], indent: int) -> list[str]:
        lines: list[str] = []
        for command in commands:
            command_type = str(command.get("type") or "").upper()
            params = json.loads(json.dumps(command.get("parameters") or {}, ensure_ascii=False))
            prefix = " " * (indent * INDENT)
            command_id = str(command.get("id") or "")
            label = ""
            if command_id in self.labels:
                lines.append(prefix + f"LABEL {self.labels[command_id]}")
            if command_type == "IF_CONDITION":
                condition = params.pop("condition", None)
                condition_text = _condition_text(condition)
                head = f"{label}IF {condition_text}" if condition_text else f"{label}IFEXPR {_format_value((condition or {}).get('expression', ''))}"
                true_commands = params.pop("trueCommands", [])
                false_commands = params.pop("falseCommands", [])
                head += self._options(params, command_type)
                lines.append(prefix + head)
                lines.extend(self._commands(true_commands, indent + 1))
                if false_commands:
                    lines.append(prefix + "ELSE")
                    lines.extend(self._commands(false_commands, indent + 1))
                continue
            spec = BY_TYPE.get(command_type)
            if not spec:
                block_field = next((field for field in ("commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands") if isinstance(params.get(field), list)), None)
                children = params.pop(block_field, []) if block_field else []
                if block_field:
                    params["block"] = block_field
                lines.append(prefix + label + "CMD " + command_type + self._options(params, command_type))
                lines.extend(self._commands(children, indent + 1))
                continue
            if command_type == "SHOW_CHOICES":
                options = params.pop("options", [])
                element_id = params.get("elementId")
                if len(options) == 1 and str(options[0].get("id")) == str(element_id):
                    params.pop("elementId", None)
                    option = dict(options[0])
                    children = option.pop("commands", [])
                    option.pop("id", None)
                    text = option.pop("text", "")
                    blocking = params.pop("blocking", None)
                    head = f"{label}BUTTON {_format_value(element_id)} {_format_value(text)}" + self._options(params, command_type)
                    lines.append(prefix + head)
                    if children:
                        click = f"CLICK {_format_value(element_id)} enabled=true"
                        if blocking is not None:
                            click += f" block={_format_value(blocking)}"
                        lines.append(prefix + click)
                        lines.extend(self._commands(children, indent + 1))
                    continue
                head = label + spec.alias + self._positional(params, spec.positional) + self._options(params, command_type)
                lines.append(prefix + head)
                for option_index, option in enumerate(options, start=1):
                    option_copy = dict(option)
                    children = option_copy.pop("commands", [])
                    option_id = option_copy.pop("id", f"option_{option_index}")
                    text = option_copy.pop("text", "")
                    lines.append(" " * ((indent + 1) * INDENT) + f"OPTION {_format_value(option_id)} {_format_value(text)}" + self._options(option_copy, None))
                    lines.extend(self._commands(children, indent + 2))
                continue
            if command_type == "SET_VARIABLE":
                key, op, value = params.pop("key"), params.pop("op", "set"), params.pop("value")
                reverse_op = {"set": "=", "add": "+", "sub": "-", "mul": "*", "div": "/"}
                head = f"{label}VAR {_format_value(key)} {reverse_op.get(op, op)} {_format_value(value)}"
            elif command_type in {"LOOP", "BREAK"} and (condition_text := _condition_text(params.get("condition"))):
                params.pop("condition", None)
                params.pop("loopType", None)
                head = f"{label}{spec.alias} {condition_text}"
            elif command_type == "CHECK_IN_AREA":
                element = params.pop("elementId")
                area = params.pop("area")
                head = f"{label}AREA {_format_value(element)} " + " ".join(_format_value(area[name]) for name in ("x", "y", "width", "height"))
            else:
                head = label + spec.alias + self._positional(params, spec.positional)
            if command_type == "JUMP_TO" and str(command.get("parameters", {}).get("target")) in self.labels:
                params.pop("target", None)
                head = f"JUMP {self.labels[str(command.get('parameters', {}).get('target'))]}"
            elif command_type == "JUMP_TO":
                target = str(command.get("parameters", {}).get("target"))
                params.pop("target", None)
                head = f"JUMP_ID {_format_value(target)}"
            children = params.pop(spec.block_field, []) if spec.block_field else []
            if command_type == "SET_CLICKABLE" and children and params.get("onClick") == "commands":
                params.pop("onClick")
            head += self._options(params, command_type)
            lines.append(prefix + head)
            lines.extend(self._commands(children, indent + 1))
        return lines

    def _positional(self, params: dict[str, Any], fields: tuple[str, ...]) -> str:
        values = []
        for field in fields:
            if field not in params:
                break
            values.append(_format_value(params.pop(field)))
        return (" " + " ".join(values)) if values else ""

    def _options(self, params: dict[str, Any], command_type: str | None) -> str:
        aliases = REVERSE_OPTION_ALIASES.get(command_type or "", {})
        aliased: list[tuple[str, Any]] = []
        remaining = json.loads(json.dumps(params, ensure_ascii=False))
        for path, alias in aliases.items():
            found, value = _pop_path(remaining, path)
            if found:
                aliased.append((alias, value))
        # Emit residual parent objects first. Nested aliases then merge into
        # them during parsing instead of being overwritten by e.g. ui={...}.
        flattened = [*sorted(remaining.items()), *aliased]
        return "".join(f" {key}={_format_value(value)}" for key, value in flattened)


def serialize_patch(patch: dict[str, Any]) -> str:
    return Serializer(patch).serialize()


def normalize_for_comparison(patch: dict[str, Any]) -> dict[str, Any]:
    """Normalize generated IDs while preserving control-flow references."""
    clone = json.loads(json.dumps(patch, ensure_ascii=False))
    id_map: dict[str, str] = {}
    for index, command in enumerate(walk_commands(clone.get("commands") or [], clone.get("extra_events") or []), start=1):
        for key in tuple(command):
            if key not in {"id", "type", "parameters"}:
                command.pop(key, None)
        old = str(command.get("id") or "")
        new = f"c{index}"
        if old:
            id_map[old] = new
        command["id"] = new
    for command in walk_commands(clone.get("commands") or [], clone.get("extra_events") or []):
        if command.get("type") == "IF_CONDITION":
            condition = (command.get("parameters") or {}).get("condition")
            if isinstance(condition, dict):
                if not condition.get("expression"):
                    condition.pop("expression", None)
                if condition.get("type") == "expression":
                    condition.pop("operator", None)
                    if condition.get("key") in {None, ""}:
                        condition.pop("key", None)
                    if condition.get("value") in {None, ""}:
                        condition.pop("value", None)
        if command.get("type") == "SET_VARIABLE":
            params = command.get("parameters") or {}
            params.setdefault("op", "set")
        if command.get("type") == "SHOW_IMAGE":
            params = command.get("parameters") or {}
            if "position" not in params and ("x" in params or "y" in params):
                params["position"] = {key: params.pop(key) for key in ("x", "y") if key in params}
            if "size" not in params and ("width" in params or "height" in params):
                params["size"] = {key: params.pop(key) for key in ("width", "height") if key in params}
        if command.get("type") == "SHOW_CHOICES":
            options = (command.get("parameters") or {}).get("options") or []
            for option_index, option in enumerate(options, start=1):
                if isinstance(option, dict):
                    option.setdefault("id", f"option_{option_index}")
                    if option.get("commands") == []:
                        option.pop("commands", None)
        if command.get("type") == "JUMP_TO":
            params = command.get("parameters") or {}
            if params.get("target") in id_map:
                params["target"] = id_map[params["target"]]
    for index, event in enumerate(clone.get("extra_events") or [], start=1):
        event["id"] = f"e{index}"
    return {"commands": clone.get("commands") or [], "extra_events": clone.get("extra_events") or []}
