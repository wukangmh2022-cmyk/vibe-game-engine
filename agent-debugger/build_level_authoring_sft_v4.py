#!/usr/bin/env python3
"""Create a natural-language V4 view from the runtime-verified V3 corpus."""

from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any, Iterable

from build_command_db import ROOT as REPO_ROOT


ROOT = REPO_ROOT
V3_PASSED = ROOT / "training-data" / "level-authoring-sft-v3-runtime-passed.jsonl"
OUTPUT = ROOT / "training-data" / "level-authoring-sft-v4.jsonl"
MANIFEST = ROOT / "training-data" / "level-authoring-sft-v4-manifest.json"
TOPICS = ["图片配对", "水果分类", "路线选择", "顺序记忆", "药品整理", "节奏点击", "物品归位", "数字比较", "颜色识别", "工具匹配", "安全判断", "昆虫观察", "服药提醒", "食材记忆", "剂量配比"]
SCENE_TITLES = (
    "服药小管家", "药品领航员", "顺序记忆师", "记忆衣橱", "小笼包派对",
    "眼疾手快分类赛", "农具速记挑战", "虫虫大作战", "各就各位", "谁知盘中餐",
    "速记消除战", "老火锅忆食记", "瓜果分类达人", "小小药剂师", "药品规划家",
)
TECHNICAL_REPLACEMENTS = (
    ("主流程", "答题过程"), ("独立事件", "同时进行的处理"), ("入场动画", "出现效果"),
    ("退场动画", "消失效果"), ("设置可点击", "让它可以点"), ("设置可拖动", "让它可以拖动"),
    ("设置可选中", "让它可以选择"), ("条件判断", "按结果处理"), ("发送信号", "触发后续处理"),
    ("更新文本", "改掉画面上的文字"), ("循环", "反复执行"), ("变量", "状态"),
    ("SHOW_TEXT", "显示文字"), ("UPDATE_TEXT", "改写文字"), ("SHOW_IMAGE", "显示图片"),
    ("SCENE_REDIRECT", "切换到另一个画面"),
)
LEGACY_INTENT_OVERRIDES = {
    "phase1-g0008": "让画面焦点一个个切换，切到第三个位置后停下来。",
    "phase1-g0006": "玩家答错后给出失败反馈，提示出现后就别再重复播放。",
    "phase1-g0042": "准备几条提示轮流出现，第三条出现后就停止刷新。",
    "phase1-g0062": "玩家选好分类路径后，马上结束等待并进入他选的那一支。",
    "phase1-g0111": "道具出现一次后就别再重复亮出来。",
    "phase1-g0113": "依次显示五件农具，到最后一件时停下。",
    "phase1-g0183": "玩家达到三连击时播放掌声庆祝，庆祝只来一次。",
    "phase1-g0341": "等物品都准备好后再继续分类，准备好之前别往下走。",
    "phase1-g0357": "记忆序列准备好之前先等一等，准备好后继续下一步。",
    "phase1-g0410": "玩家准备重新尝试时，等他确认后再继续后面的内容。",
    "phase1-g0602": "玩家选好药品分类后，立刻进入他选的那一条内容。",
    "phase1-g0618": "玩家选好衣物记忆的分支后，结束等待并继续。",
    "phase1-g0830": "等玩家选定蔬果或肉类分类后，再继续后面的内容。",
    "phase1-g0846": "玩家做完选择后，马上结束等待并进入下一步。",
    "phase1-g0915": "答题进度一项项往前走，完成五项后停止刷新。",
    "phase1-g0812": "每秒更新一次计时，走到第八秒时停下来。",
    "phase1-g0172": "重试时放一段轻一点的背景音乐，玩家确认重新开始后慢慢收掉，别和下一轮的开场声音撞在一起。",
    "phase1-g0848": "新手提示出现后先等玩家看完，确认读完了再继续问诊。",
    "phase1-g0715": "还没揭开时，在画面中间显示莴笋图片；已经出现过就不用再显示。",
    "phase1-g0141": "答对时响一下掌声，稍等片刻就收掉，让它作为短促的正确反馈。",
    "phase1-g0541": "答题得分变动后看一下是否已经达标，达标的话就进入下一关。",
    "phase1-g0067": "玩家答对后响一下掌声，然后慢慢淡出结束。",
    "phase1-g0838": "先按答错来处理：弹出失败遮罩和提示框，再响一下结束音效。",
    "phase1-g0223": "结算得分时响一下掌声烘托气氛，过一会儿再收掉。",
    "phase1-g0011": "玩家每答对一题就加一分，凑够三分后进入通关页面。",
    "phase1-g0630": "提示内容变化时配一小段轻的背景音乐，烘托一下画面就行。",
    "phase1-g0743": "环境氛围每隔 800 毫秒更新一次；玩家结束这一段时就停止更新。",
    "phase1-g0044": "服药计时每秒往前走一拍，数到第八拍就停下。",
    "phase1-g0154": "新手提示期间放一段安静的背景音乐，提示结束后慢慢收掉，让玩家能专心看说明。",
    "phase1-g0034": "玩家选错药品时记一次失误；还有机会就重新开始这一关，机会用完就显示失败。",
    "phase1-g0408": "新手提示会一直显示，等玩家完成提示里的点选后再结束。",
    "phase1-g0414": "答错时先响一下系统反馈音，停顿 800 毫秒，让玩家有时间看到反馈。",
    "phase1-g0088": "先把问诊焦点放在第一步，再根据这一步切换画面焦点。",
    "phase1-g0080": "新手提示一直保留到玩家完成阅读，完成后再继续后面的内容。",
    "phase1-g0610": "这轮答错时走失败反馈；答对就不用额外处理。",
    "phase1-g0136": "玩家挑选分支时放一段紧张的背景音乐，选完后慢慢收掉。",
    "phase1-g0400": "根据当前问诊焦点在毛巾和肥皂之间切换显示。",
    "phase1-g0124": "重试时显示物品图片，再把它移到盘子 A 的位置。",
    "phase1-g0364": "玩家选择分类路径时放一段提示背景音乐，选好后立刻淡出结束。",
    "phase1-g0605": "让环境氛围持续播放，画面需要回到氛围开始处时就从头接着播。",
    "phase1-g0745": "答对后先显示“正在核对你的答案…”，停顿片刻，再把这条反馈改成“回答正确！请继续下一题”。",
}


def walk_commands(commands: Any) -> Iterable[dict[str, Any]]:
    if not isinstance(commands, list):
        return
    for command in commands:
        if not isinstance(command, dict):
            continue
        yield command
        parameters = command.get("parameters") or {}
        for field in ("commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands"):
            yield from walk_commands(parameters.get(field))
        for option in parameters.get("options") or []:
            if isinstance(option, dict):
                yield from walk_commands(option.get("commands"))


def output_fingerprint(record: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(record.get("output") or {}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def number(record: dict[str, Any]) -> int:
    match = re.search(r"(\d{3})$", str(record.get("sample_id") or ""))
    return int(match.group(1)) if match else 1


def parameter_value(record: dict[str, Any], command_type: str, key: str, default: Any) -> Any:
    for command in walk_commands((record.get("output") or {}).get("commands")):
        if command.get("type") == command_type and key in (command.get("parameters") or {}):
            return command["parameters"][key]
    for event in (record.get("output") or {}).get("extra_events") or []:
        for command in walk_commands(event.get("commands") if isinstance(event, dict) else []):
            if command.get("type") == command_type and key in (command.get("parameters") or {}):
                return command["parameters"][key]
    return default


def condition_threshold(record: dict[str, Any], key_prefix: str, default: int) -> int:
    streams = [(record.get("output") or {}).get("commands") or []]
    streams.extend(event.get("commands") or [] for event in (record.get("output") or {}).get("extra_events") or [] if isinstance(event, dict))
    for stream in streams:
        for command in walk_commands(stream):
            condition = (command.get("parameters") or {}).get("condition")
            if isinstance(condition, dict) and str(condition.get("key") or "").startswith(key_prefix) and isinstance(condition.get("value"), int):
                return condition["value"]
    return default


def phase2_intent(record: dict[str, Any]) -> str:
    index = number(record); family = (record.get("training_validation") or {}).get("phase2_family")
    if not family:
        family_order = ((45, "countdown"), (80, "music"), (115, "ambient"), (160, "score"), (200, "assist"), (230, "celebrate"), (255, "transition"), (300, "three_way"))
        family = next(name for upper, name in family_order if index <= upper)
    topic = TOPICS[(index - 1) % len(TOPICS)]
    values = [command.get("parameters") or {} for command in walk_commands((record.get("output") or {}).get("commands"))]
    timer = next((p.get("value") for p in values if str(p.get("key", "")).startswith("timer_") and isinstance(p.get("value"), int)), 15)
    score_delta = next((p.get("value") for p in values if p.get("op") == "add" and str(p.get("key", "")).startswith("score_") and isinstance(p.get("value"), int)), 5)
    phase_step = next((p.get("value") for p in values if p.get("op") == "add" and str(p.get("key", "")).startswith("phase_") and isinstance(p.get("value"), int)), 1)
    threshold = condition_threshold(record, "score_", 10)
    variants = index % 4
    if family == "countdown":
        return [f"做一道{topic}小题，题目出来就开始 {timer} 秒倒计时。时间要一秒一秒地变，玩家答题时别被卡住。", f"{topic}这一关想加点紧张感：一看到题目就读秒 {timer} 秒，不过答案照样可以随时点。", f"画面里放出{topic}题目后，同时跑一个 {timer} 秒的计时，时间显示跟着走。", f"帮我做个{topic}答题页，给玩家 {timer} 秒；倒计时在旁边自己走，不要打断答题。 "][variants]
    if family == "music":
        return [f"进入{topic}这题时放点背景音乐，玩家答完这一轮再停掉，别影响他点答案。", f"{topic}开始时想有音乐陪着，完成这题后自然收掉。", f"做{topic}题的时候让背景音乐一直放着，答完后停止就行。", f"给{topic}这一关加个背景音乐：开始就放，点完答案再停。 "][variants]
    if family == "ambient":
        motion = "轻轻上下浮动" if index % 2 else "一闪一闪地呼吸"
        return [f"做{topic}题时，让背景提示一直{motion}，玩家照常可以点答案。", f"{topic}页面别太静，背景提示{motion}就好，不要挡住答题。", f"题目出来后让旁边的提示{motion}，答题操作照旧。", f"我想让{topic}的背景提示{motion}，但别影响玩家操作。 "][variants]
    if family == "score":
        return [f"{topic}答对一次就加 {score_delta} 分，分数马上改掉，再来一下短音效。", f"做{topic}时，玩家点对答案后记 {score_delta} 分，画面上的分数和声音都跟着反馈。", f"{topic}答对要有感觉：加 {score_delta} 分、分数跳一下、响个提示音。", f"玩家完成{topic}这题后给 {score_delta} 分，并立刻更新分数显示和音效。 "][variants]
    if family == "assist":
        threshold = condition_threshold(record, "errors_", 3)
        return [f"做{topic}答题时，要是连续错了 {threshold} 次，就弹一次小提示，但题目别关掉。", f"玩家在{topic}这里老是答错，连错 {threshold} 次给他一点提醒，之后继续答。", f"{topic}的帮助别太早出现，累计错到 {threshold} 次才提示一次。", f"如果{topic}连续错了 {threshold} 回，给一句提示就行，不要中断这题。 "][variants]
    if family == "celebrate":
        return [f"{topic}每答对一次加 {score_delta} 分，攒到 {threshold} 分时放一次烟花和音效，之后别重复放。", f"玩家在{topic}里拿够 {threshold} 分时，来一次开心点的庆祝；同一关只来一回。", f"做{topic}时，分数到 {threshold} 就亮一次烟花、响一下，继续答题也没关系。", f"{topic}的高分反馈想热闹一点，达到 {threshold} 分时庆祝一次就够。 "][variants]
    if family == "transition":
        threshold = condition_threshold(record, "phase_", 3)
        return [f"{topic}每完成一次就往前走 {phase_step} 步，走到第 {threshold} 步时切到下一关，别重复跳。", f"玩家做完{topic}的第 {threshold} 次进度后，自动进下一关就行。", f"{topic}这一关每点完一轮就推进一下，到第 {threshold} 阶段再换关。", f"帮我把{topic}的过关节奏做成：完成 {threshold} 次后进入下一关，只触发一次。 "][variants]
    return [f"做个{topic}答题页：旁边有 {timer} 秒倒计时，答对一次加 {score_delta} 分，攒到 {threshold} 分时庆祝一次。", f"{topic}这一关开始后就读秒 {timer} 秒；玩家点对答案会加分，到 {threshold} 分给一次庆祝。", f"我想让{topic}有点节奏感，计时照走，答对加 {score_delta} 分，够 {threshold} 分就放烟花。", f"{topic}页面要同时有倒计时、答题加分和高分庆祝，庆祝只出现一次。 "][variants]


def phase3_intent(record: dict[str, Any]) -> str:
    index = number(record); source = str(record.get("sample_id") or "")
    topic = TOPICS[(index - 1) % len(TOPICS)]
    variants = index % 4
    family = next(name for upper, name in ((25, "clickable"), (50, "animate"), (75, "select"), (100, "draggable"), (125, "check_in_area"), (150, "animate"), (175, "flip"), (200, "select"), (240, "complex")) if index <= upper)
    if family == "clickable":
        return [f"放一张{topic}卡片，点一下就记成看过。", f"{topic}这张卡要能点，点过后帮我记一下。", f"让玩家点一下{topic}卡片，之后标记为已查看。", f"画面上来一张{topic}卡，点击后记录这次操作。 "][variants]
    if family in {"draggable", "check_in_area"}:
        return [f"把{topic}物品做成可以拖的。", f"{topic}这个东西让玩家拖着玩；放进目标区域后记一次成功。", f"玩家应该能拖动{topic}物品，放对位置就算完成。", f"给{topic}物品加上拖拽，投到指定位置时做个完成记录。 "][variants]
    if family == "flip":
        return [f"做一张{topic}翻翻卡，从正面翻到背面时带点过渡。", f"{topic}卡片点开后翻到背面，别一下子硬切。", f"让{topic}这张卡能翻面，正反两面用给的图片。", f"给{topic}卡片做个翻面效果。 "][variants]
    if family == "select":
        return [f"把{topic}卡片做成可选的，玩家点一下能看出选中了。", f"{topic}选项要能选中和取消，状态跟着变。", f"让玩家能挑选{topic}卡片，再次操作时也能取消。", f"做个{topic}选择效果，点过后有明显选中状态。 "][variants]
    if family == "animate":
        return [f"{topic}卡片出现时柔和一点，别突然跳出来。", f"让{topic}提示卡先慢慢出现，再根据情况消失。", f"{topic}卡片进出画面时加一点自然的动效。", f"画面上的{topic}卡片出现和离开都做得顺一点。 "][variants]
    return [f"做一个{topic}的小交互，玩家操作后给出相应反馈。", f"{topic}这里想要一个简单、顺手的互动过程。", f"帮我把{topic}做成玩家能直接操作的小环节。", f"{topic}这一步别太复杂，让玩家点一两下就能完成。 "][variants]


def legacy_intent(sample_id: str, intent: str, index: int) -> str:
    if sample_id in LEGACY_INTENT_OVERRIDES:
        return LEGACY_INTENT_OVERRIDES[sample_id]
    text = re.sub(r"[。！？]?\s*(?:该需求不需要|这个需求需要(?:多个)?)[^。！？]*跨事件协同[。！？]?", "", intent).strip(" 。！？")
    text = re.sub(r"^(?:请)?在当前(?:空白)?关卡(?:中|里)?[，,：:]?", "", text)
    text = re.sub(r"发出([^。；，,]+?)信号以触发([^。；，,]+?)(?:流程)?", r"出现\1时，接着处理\2", text)
    for source, target in TECHNICAL_REPLACEMENTS:
        text = text.replace(source, target)
    text = text.replace("信号", "后续处理")
    text = text.replace("先用显示文字显示", "先显示")
    text = text.replace("随后用改写文字将同一元素内容改写为", "随后把同一处文字改成")
    text = text.replace("再用改写文字将同一文本元素改写为", "再把同一处文字改成")
    text = text.replace("反复执行", "一直重复")
    text = text.replace("BREAK", "停下来")
    text = text.replace("当前关卡", "这一关")
    text = text.replace("在“这一关”这一关中，", "")
    text = re.sub(r"\s+", " ", text).strip(" 的，,；;")
    if not text:
        return "帮我把这一关的反馈和操作顺一下。"
    if text.startswith("显示"):
        starters = ("画面上放", "先来一个", "帮我做个", "让玩家看到")
        text = starters[index % len(starters)] + text[2:]
    return text + ("。" if text[-1] not in "。！？" else "")


def has_top_level_signal_without_event(record: dict[str, Any]) -> bool:
    output = record.get("output") or {}
    return not output.get("extra_events") and any(command.get("type") == "EMIT_SIGNAL" for command in output.get("commands") or [])


def has_empty_condition_branch(record: dict[str, Any]) -> bool:
    """A condition with no child commands is a no-op, not usable behavior."""
    output = record.get("output") or {}
    streams = [output.get("commands") or []]
    streams.extend(event.get("commands") or [] for event in output.get("extra_events") or [] if isinstance(event, dict))
    for stream in streams:
        for command in walk_commands(stream):
            if command.get("type") != "IF_CONDITION":
                continue
            parameters = command.get("parameters") or {}
            if not parameters.get("trueCommands") and not parameters.get("falseCommands"):
                return True
    return False


def has_unproductive_loop(record: dict[str, Any]) -> bool:
    """Reject polling loops that can neither change nor receive the observed state."""
    output = record.get("output") or {}
    streams = [output.get("commands") or []]
    streams.extend(event.get("commands") or [] for event in output.get("extra_events") or [] if isinstance(event, dict))
    for stream in streams:
        for command in walk_commands(stream):
            if command.get("type") != "LOOP":
                continue
            body = (command.get("parameters") or {}).get("commands") or []
            types = {child.get("type") for child in body if isinstance(child, dict)}
            if types and types <= {"BREAK", "WAIT"}:
                return True
    return False


def anonymize_assets(record: dict[str, Any]) -> None:
    """Keep resource identity while removing the source-level name from the user prompt."""
    catalog = (record.get("input") or {}).get("asset_catalog") or []
    sanitized: list[dict[str, Any]] = []
    for asset in catalog:
        if not isinstance(asset, dict):
            continue
        path = re.sub(r"(^|/)G\d+-[^/]+/", r"\1", str(asset.get("path") or ""))
        path = re.sub(r"intro-[^/]+(?=\.[^.]+$)", "intro", path)
        sanitized.append({key: value for key, value in {
            "id": asset.get("id"), "type": asset.get("type"), "path": path,
            "origin": asset.get("origin"), "exists": asset.get("exists"),
        }.items() if value is not None})
    record.setdefault("input", {})["asset_catalog"] = sanitized


def repair_known_unambiguous_outputs(record: dict[str, Any]) -> bool:
    """Repair only defects whose intended command tree is fully specified by the record."""
    commands = (record.get("output") or {}).get("commands") or []
    sample_id = str(record.get("sample_id") or "")
    if sample_id == "phase1-g0541":
        condition = commands[1]
        condition["parameters"]["trueCommands"] = [commands[2]]
        del commands[2]
        return True
    if sample_id in {"phase1-g0907", "phase1-g0224"}:
        commands.pop()
        return True
    if sample_id == "phase1-g0745":
        commands.insert(1, {"id": "wait_correct_feedback", "type": "WAIT", "parameters": {"duration": 600}})
        return True
    if sample_id == "phase1-g0401":
        condition = commands[1]
        condition["parameters"]["trueCommands"] = condition.pop("trueCommands", [])
        condition.pop("falseCommands", None)
        return True
    return False


def main() -> int:
    records = [json.loads(line) for line in V3_PASSED.read_text(encoding="utf-8").splitlines() if line.strip()]
    transformed: list[dict[str, Any]] = []
    dropped: dict[str, list[str]] = {"incomplete_signal_only": [], "empty_condition_branch": [], "unproductive_loop": [], "invalid_expression_transition": []}
    repaired: list[str] = []
    for original in records:
        if original.get("source_dataset") == "command-agent-sft-v1" and has_top_level_signal_without_event(original):
            dropped["incomplete_signal_only"].append(str(original.get("sample_id")))
            continue
        record = deepcopy(original)
        if repair_known_unambiguous_outputs(record):
            repaired.append(str(record.get("sample_id")))
        if str(record.get("sample_id")) == "phase1-g0416":
            dropped["invalid_expression_transition"].append(str(record.get("sample_id")))
            continue
        if has_empty_condition_branch(record):
            dropped["empty_condition_branch"].append(str(record.get("sample_id")))
            continue
        if has_unproductive_loop(record):
            dropped["unproductive_loop"].append(str(record.get("sample_id")))
            continue
        index = number(record)
        if record.get("source_dataset") == "event-coordination-sft-v3":
            intent = phase2_intent(record)
        elif record.get("source_dataset") == "interaction-sft-v3":
            intent = phase3_intent(record)
        else:
            intent = legacy_intent(str(record.get("sample_id") or ""), str((record.get("input") or {}).get("intent") or ""), index)
        for title in SCENE_TITLES:
            intent = intent.replace(title, "这一关")
        record.setdefault("input", {})["intent"] = intent
        anonymize_assets(record)
        record["dataset_version"] = "level-authoring-sft-v4-natural-intents"
        record.setdefault("training_validation", {})["natural_intent_v4"] = True
        if str(record.get("sample_id")) not in repaired and output_fingerprint(record) != output_fingerprint(original):
            raise RuntimeError(f"output changed while naturalizing {record.get('sample_id')}")
        transformed.append(record)
    OUTPUT.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in transformed), encoding="utf-8")
    manifest = {
        "schema_version": "level-authoring-sft-v4-natural-intents-manifest", "input": str(V3_PASSED.relative_to(ROOT)),
        "output": str(OUTPUT.relative_to(ROOT)), "retained": len(transformed), "dropped": dropped,
        "repaired_sample_ids": repaired, "output_contract_unchanged_except_repairs": repaired,
        "runtime_validation_inherited_from_v3": False,
        "runtime_validation_report": "training-data/level-authoring-sft-v4-runtime-validation.json",
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
