#!/usr/bin/env python3
"""Tiny local web reviewer for VGE DSL SFT rows.

Usage:
  python training/qlora/review_tool/review_server.py

Open:
  http://127.0.0.1:8765
"""

from __future__ import annotations

import argparse
import difflib
import json
import mimetypes
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATA_DIR = ROOT / "training/qlora/data/level-authoring-dsl-v2"
DEFAULT_REVIEW_DIR = DEFAULT_DATA_DIR / "manual_review"
DEFAULT_API_REPAIR_DIR = ROOT / "training-data/dsl-v3-api-repair"


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def append_jsonl(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(value, ensure_ascii=False) + "\n")


class ReviewState:
    def __init__(self, data_dir: Path, review_dir: Path, api_repair_dir: Path) -> None:
        self.data_dir = data_dir
        self.review_dir = review_dir
        self.api_repair_dir = api_repair_dir
        self.results_path = review_dir / "review_results.json"
        self.events_path = review_dir / "review_events.jsonl"
        self.compare_results_path = api_repair_dir / "compare_review_results.json"
        self.compare_events_path = api_repair_dir / "compare_review_events.jsonl"
        self.lock = threading.Lock()
        rows: list[dict] = []
        for split in ("train", "validation"):
            for row in read_jsonl(data_dir / f"{split}.jsonl"):
                rows.append({**row, "split": split})
        self.rows = rows
        self.by_id = {row["id"]: row for row in rows}
        self.converted_by_source = {
            row["source_id"]: row
            for row in read_jsonl(data_dir / "converted.jsonl")
        }
        self.api_repairs = read_jsonl(api_repair_dir / "accepted-repairs.jsonl") if (api_repair_dir / "accepted-repairs.jsonl").exists() else []
        self.api_repairs_by_source = {row["source_id"]: row for row in self.api_repairs}
        if self.results_path.exists():
            self.results = json.loads(self.results_path.read_text(encoding="utf-8"))
        else:
            self.results = {}
        if self.compare_results_path.exists():
            self.compare_results = json.loads(self.compare_results_path.read_text(encoding="utf-8"))
        else:
            self.compare_results = {}

    def summary(self) -> dict:
        counts = {"pass": 0, "fail": 0, "skip": 0}
        for item in self.results.values():
            verdict = item.get("verdict")
            if verdict in counts:
                counts[verdict] += 1
        return {
            "total": len(self.rows),
            "reviewed": counts["pass"] + counts["fail"] + counts["skip"],
            "remaining": len(self.rows) - counts["pass"] - counts["fail"] - counts["skip"],
            **counts,
        }

    def page(self, page: int, page_size: int) -> dict:
        total_pages = max(1, (len(self.rows) + page_size - 1) // page_size)
        page = min(max(page, 0), total_pages - 1)
        start = page * page_size
        items = []
        for row in self.rows[start : start + page_size]:
            messages = row["messages"]
            items.append({
                "id": row["id"],
                "source_id": row["source_id"],
                "split": row["split"],
                "query_variant": row.get("query_variant"),
                "system": messages[0]["content"],
                "user": messages[1]["content"],
                "assistant": messages[2]["content"],
                "result": self.results.get(row["id"]),
            })
        return {
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "items": items,
            "summary": self.summary(),
        }

    def set_result(self, sample_id: str, verdict: str, note: str = "") -> dict:
        if sample_id not in self.by_id:
            raise KeyError(sample_id)
        if verdict not in {"pass", "fail", "skip", "clear"}:
            raise ValueError(verdict)
        with self.lock:
            event = {
                "time": datetime.now(timezone.utc).isoformat(),
                "id": sample_id,
                "source_id": self.by_id[sample_id]["source_id"],
                "split": self.by_id[sample_id]["split"],
                "verdict": verdict,
                "note": note,
            }
            if verdict == "clear":
                self.results.pop(sample_id, None)
            else:
                self.results[sample_id] = event
            write_json(self.results_path, self.results)
            append_jsonl(self.events_path, event)
        return {"ok": True, "summary": self.summary(), "result": self.results.get(sample_id)}

    def compare_summary(self) -> dict:
        counts = {"pass": 0, "fail": 0, "skip": 0}
        for item in self.compare_results.values():
            verdict = item.get("verdict")
            if verdict in counts:
                counts[verdict] += 1
        total = len(self.api_repairs)
        return {
            "total": total,
            "reviewed": counts["pass"] + counts["fail"] + counts["skip"],
            "remaining": total - counts["pass"] - counts["fail"] - counts["skip"],
            **counts,
        }

    @staticmethod
    def unified_diff(before: str, after: str, fromfile: str, tofile: str) -> str:
        return "\n".join(difflib.unified_diff(
            before.splitlines(),
            after.splitlines(),
            fromfile=fromfile,
            tofile=tofile,
            lineterm="",
            n=3,
        ))

    def compare_page(self, page: int, page_size: int) -> dict:
        total_pages = max(1, (len(self.api_repairs) + page_size - 1) // page_size)
        page = min(max(page, 0), total_pages - 1)
        start = page * page_size
        items = []
        for repair in self.api_repairs[start : start + page_size]:
            source_id = repair["source_id"]
            before = self.converted_by_source.get(source_id, {})
            before_assets = before.get("asset_catalog") or []
            after_assets = repair.get("asset_catalog") or []
            before_intent = str(before.get("intent", ""))
            after_intent = str(repair.get("intent", ""))
            before_dsl = str(before.get("dsl", ""))
            after_dsl = str(repair.get("dsl", ""))
            items.append({
                "source_id": source_id,
                "before_intent": before_intent,
                "after_intent": after_intent,
                "before_assets": before_assets,
                "after_assets": after_assets,
                "before_assets_text": json.dumps(before_assets, ensure_ascii=False, indent=2),
                "after_assets_text": json.dumps(after_assets, ensure_ascii=False, indent=2),
                "before_dsl": before_dsl,
                "after_dsl": after_dsl,
                "intent_diff": self.unified_diff(before_intent, after_intent, "修改前 TASK", "修改后 TASK"),
                "asset_diff": self.unified_diff(
                    json.dumps(before_assets, ensure_ascii=False, indent=2),
                    json.dumps(after_assets, ensure_ascii=False, indent=2),
                    "修改前 ASSETS",
                    "修改后 ASSETS",
                ),
                "dsl_diff": self.unified_diff(before_dsl, after_dsl, "修改前 DSL", "修改后 DSL"),
                "reason": repair.get("reason", ""),
                "result": self.compare_results.get(source_id),
            })
        return {
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "items": items,
            "summary": self.compare_summary(),
        }

    def set_compare_result(self, source_id: str, verdict: str, note: str = "") -> dict:
        if source_id not in self.api_repairs_by_source:
            raise KeyError(source_id)
        if verdict not in {"pass", "fail", "skip", "clear"}:
            raise ValueError(verdict)
        with self.lock:
            event = {
                "time": datetime.now(timezone.utc).isoformat(),
                "source_id": source_id,
                "verdict": verdict,
                "note": note,
            }
            if verdict == "clear":
                self.compare_results.pop(source_id, None)
            else:
                self.compare_results[source_id] = event
            write_json(self.compare_results_path, self.compare_results)
            append_jsonl(self.compare_events_path, event)
        return {"ok": True, "summary": self.compare_summary(), "result": self.compare_results.get(source_id)}


INDEX_HTML = r"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VGE DSL 训练集人工审核</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7fb; --panel:#fff; --text:#172033; --muted:#667085; --line:#d8dce8; --ok:#16a34a; --bad:#dc2626; --skip:#6b7280; --accent:#2563eb; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    header { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.94); backdrop-filter: blur(8px); }
    h1 { margin: 0; font-size: 18px; }
    .pill { padding: 4px 8px; border-radius: 999px; background: #eef2ff; color: #334155; font-size: 12px; }
    .grow { flex: 1; }
    button, input { font: inherit; }
    a { color: var(--accent); text-decoration: none; }
    button { cursor: pointer; border: 1px solid var(--line); background: #fff; border-radius: 10px; padding: 8px 11px; }
    button:hover { border-color: #94a3b8; }
    button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    main { padding: 16px; max-width: 1500px; margin: 0 auto; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 10px 30px rgba(15,23,42,.05); overflow: hidden; }
    .card.pass { outline: 3px solid rgba(22,163,74,.22); }
    .card.fail { outline: 3px solid rgba(220,38,38,.22); }
    .card.skip { outline: 3px solid rgba(107,114,128,.22); }
    .card-head { padding: 12px 14px; border-bottom: 1px solid var(--line); display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .card-title { font-weight: 700; }
    .section { padding: 12px 14px; border-bottom: 1px solid #edf0f6; }
    .label { color: var(--muted); font-size: 12px; margin-bottom: 6px; display:flex; justify-content:space-between; }
    pre { margin: 0; padding: 10px; border-radius: 10px; background: #0f172a; color: #e5e7eb; overflow: auto; white-space: pre-wrap; word-break: break-word; line-height: 1.42; font-size: 13px; max-height: 260px; }
    pre.user { background: #fff7ed; color: #1f2937; border: 1px solid #fed7aa; }
    pre.assistant { background: #ecfdf5; color: #052e16; border: 1px solid #bbf7d0; font-weight: 600; }
    .actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 12px 14px; }
    .ok { background: #dcfce7; border-color: #86efac; color: #166534; font-weight: 700; }
    .bad { background: #fee2e2; border-color: #fca5a5; color: #991b1b; font-weight: 700; }
    .skip { background: #f3f4f6; color: #374151; }
    textarea { width: 100%; min-height: 42px; border-radius: 10px; border: 1px solid var(--line); padding: 8px; resize: vertical; }
    .nav { display:flex; gap:8px; align-items:center; }
    .kbd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; border:1px solid var(--line); border-bottom-width:2px; padding:1px 5px; border-radius:6px; background:#fff; }
    @media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>VGE DSL 训练集人工审核</h1>
    <a class="pill" href="/compare">API 修复前后对比</a>
    <span class="pill" id="summary">加载中…</span>
    <span class="pill">快捷键：左卡 <span class="kbd">1</span>/<span class="kbd">Q</span>，右卡 <span class="kbd">2</span>/<span class="kbd">W</span></span>
    <div class="grow"></div>
    <div class="nav">
      <button onclick="prevPage()">上一页</button>
      <span id="pageInfo"></span>
      <button onclick="nextPage(false)">下一页</button>
      <input id="jump" type="number" min="1" style="width:90px" />
      <button onclick="jumpPage()">跳转</button>
    </div>
  </header>
  <main><div class="grid" id="grid"></div></main>
<script>
let page = Number(localStorage.getItem("review_page") || "0");
const pageSize = 2;
let current = null;

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function resultClass(item) { return item.result?.verdict || ""; }

async function loadPage() {
  current = await api(`/api/page?page=${page}&page_size=${pageSize}`);
  page = current.page;
  localStorage.setItem("review_page", String(page));
  document.getElementById("pageInfo").textContent = `${page + 1} / ${current.total_pages}`;
  document.getElementById("jump").value = page + 1;
  const s = current.summary;
  document.getElementById("summary").textContent = `总 ${s.total}｜已审 ${s.reviewed}｜✅ ${s.pass}｜❌ ${s.fail}｜跳过 ${s.skip}｜剩 ${s.remaining}`;
  document.getElementById("grid").innerHTML = current.items.map((item, idx) => cardHtml(item, idx)).join("");
}

function cardHtml(item, idx) {
  const verdict = item.result?.verdict || "未审";
  const note = item.result?.note || "";
  return `<article class="card ${esc(resultClass(item))}" id="card-${idx}">
    <div class="card-head">
      <span class="card-title">${esc(item.id)}</span>
      <span class="pill">${esc(item.split)}</span>
      <span class="pill">${esc(item.source_id)}</span>
      <span class="pill">状态：${esc(verdict)}</span>
    </div>
    <div class="section">
      <div class="label"><span>User / TASK + ASSETS</span><span>${esc(item.user.length)} chars</span></div>
      <pre class="user">${esc(item.user)}</pre>
    </div>
    <div class="section">
      <div class="label"><span>Assistant / DSL</span><span>${esc(item.assistant.split(/\\n/).filter(Boolean).length)} lines</span></div>
      <pre class="assistant">${esc(item.assistant)}</pre>
    </div>
    <div class="section">
      <div class="label"><span>备注，可空</span><span>会保存</span></div>
      <textarea id="note-${idx}" placeholder="例如：query 太宽 / 资源不匹配 / OK">${esc(note)}</textarea>
    </div>
    <div class="actions">
      <button class="ok" onclick="mark(${idx}, 'pass')">✅ 通过</button>
      <button class="bad" onclick="mark(${idx}, 'fail')">❌ 有问题</button>
      <button class="skip" onclick="mark(${idx}, 'skip')">跳过</button>
    </div>
  </article>`;
}

async function mark(idx, verdict) {
  const item = current.items[idx];
  const note = document.getElementById(`note-${idx}`).value;
  await api("/api/review", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({id: item.id, verdict, note})
  });
  await loadPage();
  if (current.items.length && current.items.every(x => x.result?.verdict)) {
    setTimeout(() => nextPage(true), 130);
  }
}

function prevPage() { page = Math.max(0, page - 1); loadPage(); }
function nextPage(auto=false) {
  if (!current) return;
  page = Math.min(current.total_pages - 1, page + 1);
  loadPage();
}
function jumpPage() {
  const v = Number(document.getElementById("jump").value || "1");
  page = Math.max(0, v - 1);
  loadPage();
}

document.addEventListener("keydown", e => {
  if (!current || ["TEXTAREA", "INPUT"].includes(document.activeElement.tagName)) return;
  if (e.key === "ArrowLeft") prevPage();
  if (e.key === "ArrowRight") nextPage(false);
  if (e.key === "1") mark(0, "pass");
  if (e.key.toLowerCase() === "q") mark(0, "fail");
  if (e.key === "2") mark(1, "pass");
  if (e.key.toLowerCase() === "w") mark(1, "fail");
});

loadPage().catch(err => {
  document.getElementById("grid").innerHTML = `<pre>${esc(err.stack || err)}</pre>`;
});
</script>
</body>
</html>
"""


COMPARE_HTML = r"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VGE DSL API 修复前后对比</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7fb; --panel:#fff; --text:#172033; --muted:#667085; --line:#d8dce8; --ok:#16a34a; --bad:#dc2626; --skip:#6b7280; --accent:#7c3aed; --add:#dcfce7; --del:#fee2e2; --meta:#eef2ff; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    header { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.94); backdrop-filter: blur(8px); }
    h1 { margin: 0; font-size: 18px; }
    a { color: var(--accent); text-decoration: none; }
    button, input { font: inherit; }
    button { cursor: pointer; border: 1px solid var(--line); background: #fff; border-radius: 10px; padding: 8px 11px; }
    button:hover { border-color: #94a3b8; }
    .pill { padding: 4px 8px; border-radius: 999px; background: #eef2ff; color: #334155; font-size: 12px; }
    .grow { flex: 1; }
    main { padding: 16px; max-width: 1600px; margin: 0 auto; }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 10px 30px rgba(15,23,42,.05); overflow: hidden; margin-bottom: 16px; }
    .card.pass { outline: 3px solid rgba(22,163,74,.22); }
    .card.fail { outline: 3px solid rgba(220,38,38,.22); }
    .card.skip { outline: 3px solid rgba(107,114,128,.22); }
    .head { padding: 12px 14px; border-bottom: 1px solid var(--line); display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .title { font-weight: 800; }
    .cols { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px 14px; }
    .col { min-width:0; }
    .label { color: var(--muted); font-size: 12px; margin: 8px 0 6px; display:flex; justify-content:space-between; }
    pre { margin: 0; padding: 10px; border-radius: 10px; background: #0f172a; color: #e5e7eb; overflow: auto; white-space: pre-wrap; word-break: break-word; line-height: 1.42; font-size: 13px; max-height: 360px; }
    pre.intent { background: #fff7ed; color: #1f2937; border: 1px solid #fed7aa; }
    pre.assets { background: #eff6ff; color: #172554; border: 1px solid #bfdbfe; }
    pre.dsl { background: #ecfdf5; color: #052e16; border: 1px solid #bbf7d0; font-weight: 600; }
    .diffwrap { padding: 0 14px 12px; }
    .diff { background: #111827; color:#e5e7eb; border: 1px solid #111827; max-height: 300px; }
    .diff .add { display:block; background: rgba(22,163,74,.25); color:#dcfce7; }
    .diff .del { display:block; background: rgba(220,38,38,.25); color:#fee2e2; }
    .diff .meta { display:block; background: rgba(99,102,241,.22); color:#c7d2fe; }
    .diff .ctx { display:block; }
    .reason { margin: 0; padding: 10px; border-radius: 10px; background: #faf5ff; border: 1px solid #e9d5ff; color: #3b0764; line-height: 1.45; }
    .actions { display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--line); }
    .ok { background: #dcfce7; border-color: #86efac; color: #166534; font-weight: 700; }
    .bad { background: #fee2e2; border-color: #fca5a5; color: #991b1b; font-weight: 700; }
    .skip { background: #f3f4f6; color: #374151; }
    textarea { width: 100%; min-height: 46px; border-radius: 10px; border: 1px solid var(--line); padding: 8px; resize: vertical; }
    .nav { display:flex; gap:8px; align-items:center; }
    .kbd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; border:1px solid var(--line); border-bottom-width:2px; padding:1px 5px; border-radius:6px; background:#fff; }
    @media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>API 修复前后对比</h1>
    <a class="pill" href="/">返回普通审核</a>
    <span class="pill" id="summary">加载中…</span>
    <span class="pill">快捷键：<span class="kbd">1</span> 通过 / <span class="kbd">Q</span> 有问题 / <span class="kbd">S</span> 跳过</span>
    <div class="grow"></div>
    <div class="nav">
      <button onclick="prevPage()">上一条</button>
      <span id="pageInfo"></span>
      <button onclick="nextPage(false)">下一条</button>
      <input id="jump" type="number" min="1" style="width:90px" />
      <button onclick="jumpPage()">跳转</button>
    </div>
  </header>
  <main><div id="root"></div></main>
<script>
let page = Number(localStorage.getItem("compare_review_page") || "0");
const pageSize = 1;
let current = null;

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function diffHtml(s) {
  if (!s) return '<span class="ctx">无差异</span>';
  return esc(s).split("\n").map(line => {
    const cls = line.startsWith("+") && !line.startsWith("+++") ? "add" :
                line.startsWith("-") && !line.startsWith("---") ? "del" :
                line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++") ? "meta" : "ctx";
    return `<span class="${cls}">${line || " "}</span>`;
  }).join("");
}
async function loadPage() {
  current = await api(`/api/compare_page?page=${page}&page_size=${pageSize}`);
  page = current.page;
  localStorage.setItem("compare_review_page", String(page));
  document.getElementById("pageInfo").textContent = `${page + 1} / ${current.total_pages}`;
  document.getElementById("jump").value = page + 1;
  const s = current.summary;
  document.getElementById("summary").textContent = `总修复 ${s.total}｜已审 ${s.reviewed}｜✅ ${s.pass}｜❌ ${s.fail}｜跳过 ${s.skip}｜剩 ${s.remaining}`;
  document.getElementById("root").innerHTML = current.items.map(cardHtml).join("");
}
function cardHtml(item) {
  const verdict = item.result?.verdict || "未审";
  const note = item.result?.note || "";
  return `<article class="card ${esc(item.result?.verdict || "")}">
    <div class="head">
      <span class="title">${esc(item.source_id)}</span>
      <span class="pill">状态：${esc(verdict)}</span>
    </div>
    <div class="cols">
      <div class="col">
        <div class="label"><span>修改前 TASK</span><span>${esc(item.before_intent.length)} chars</span></div>
        <pre class="intent">${esc(item.before_intent)}</pre>
        <div class="label"><span>修改前 ASSETS</span></div>
        <pre class="assets">${esc(item.before_assets_text)}</pre>
        <div class="label"><span>修改前 DSL</span><span>${esc(item.before_dsl.split(/\n/).filter(Boolean).length)} lines</span></div>
        <pre class="dsl">${esc(item.before_dsl)}</pre>
      </div>
      <div class="col">
        <div class="label"><span>修改后 TASK</span><span>${esc(item.after_intent.length)} chars</span></div>
        <pre class="intent">${esc(item.after_intent)}</pre>
        <div class="label"><span>修改后 ASSETS</span></div>
        <pre class="assets">${esc(item.after_assets_text)}</pre>
        <div class="label"><span>修改后 DSL</span><span>${esc(item.after_dsl.split(/\n/).filter(Boolean).length)} lines</span></div>
        <pre class="dsl">${esc(item.after_dsl)}</pre>
      </div>
    </div>
    <div class="diffwrap">
      <div class="label"><span>修复原因</span></div>
      <p class="reason">${esc(item.reason)}</p>
      <div class="label"><span>TASK diff</span></div>
      <pre class="diff">${diffHtml(item.intent_diff)}</pre>
      <div class="label"><span>ASSETS diff</span></div>
      <pre class="diff">${diffHtml(item.asset_diff)}</pre>
      <div class="label"><span>DSL diff</span></div>
      <pre class="diff">${diffHtml(item.dsl_diff)}</pre>
      <div class="label"><span>备注，可空</span></div>
      <textarea id="note" placeholder="例如：修得好 / 过度扩展 / 资源仍不匹配">${esc(note)}</textarea>
    </div>
    <div class="actions">
      <button class="ok" onclick="mark('pass')">✅ 修复可接受</button>
      <button class="bad" onclick="mark('fail')">❌ 修复有问题</button>
      <button class="skip" onclick="mark('skip')">跳过</button>
    </div>
  </article>`;
}
async function mark(verdict) {
  const item = current.items[0];
  const note = document.getElementById("note").value;
  await api("/api/compare_review", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({source_id: item.source_id, verdict, note})
  });
  nextPage(true);
}
function prevPage() { page = Math.max(0, page - 1); loadPage(); }
function nextPage(auto=false) {
  if (!current) return;
  page = Math.min(current.total_pages - 1, page + 1);
  loadPage();
}
function jumpPage() {
  const v = Number(document.getElementById("jump").value || "1");
  page = Math.max(0, v - 1);
  loadPage();
}
document.addEventListener("keydown", e => {
  if (!current || ["TEXTAREA", "INPUT"].includes(document.activeElement.tagName)) return;
  if (e.key === "ArrowLeft") prevPage();
  if (e.key === "ArrowRight") nextPage(false);
  if (e.key === "1") mark("pass");
  if (e.key.toLowerCase() === "q") mark("fail");
  if (e.key.toLowerCase() === "s") mark("skip");
});
loadPage().catch(err => {
  document.getElementById("root").innerHTML = `<pre>${esc(err.stack || err)}</pre>`;
});
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    state: ReviewState

    def send_json(self, value: object, status: int = 200) -> None:
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_text(self, text: str, content_type: str = "text/html; charset=utf-8") -> None:
        payload = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self.send_text(INDEX_HTML)
            return
        if parsed.path == "/compare":
            self.send_text(COMPARE_HTML)
            return
        if parsed.path == "/api/page":
            q = parse_qs(parsed.query)
            page = int(q.get("page", ["0"])[0])
            page_size = int(q.get("page_size", ["2"])[0])
            self.send_json(self.state.page(page, page_size))
            return
        if parsed.path == "/api/compare_page":
            q = parse_qs(parsed.query)
            page = int(q.get("page", ["0"])[0])
            page_size = int(q.get("page_size", ["1"])[0])
            self.send_json(self.state.compare_page(page, page_size))
            return
        if parsed.path == "/api/summary":
            self.send_json(self.state.summary())
            return
        if parsed.path == "/api/compare_summary":
            self.send_json(self.state.compare_summary())
            return
        self.send_error(404)

    def do_POST(self) -> None:
        parsed_path = urlparse(self.path).path
        if parsed_path not in {"/api/review", "/api/compare_review"}:
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            if parsed_path == "/api/review":
                self.send_json(self.state.set_result(str(data["id"]), str(data["verdict"]), str(data.get("note", ""))))
            else:
                self.send_json(self.state.set_compare_result(str(data["source_id"]), str(data["verdict"]), str(data.get("note", ""))))
        except Exception as error:
            self.send_json({"ok": False, "error": str(error)}, status=400)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[review] {self.address_string()} {fmt % args}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--review-dir", type=Path, default=DEFAULT_REVIEW_DIR)
    parser.add_argument("--api-repair-dir", type=Path, default=DEFAULT_API_REPAIR_DIR)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    Handler.state = ReviewState(args.data_dir, args.review_dir, args.api_repair_dir)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"审核网页：http://{args.host}:{args.port}")
    print(f"API 修复前后对比：http://{args.host}:{args.port}/compare")
    print(f"审核结果：{Handler.state.results_path}")
    print(f"审核事件日志：{Handler.state.events_path}")
    print(f"API 修复对比结果：{Handler.state.compare_results_path}")
    print(f"API 修复对比事件日志：{Handler.state.compare_events_path}")
    print("快捷键：左卡 1=通过 q=有问题；右卡 2=通过 w=有问题；左右箭头翻页")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
