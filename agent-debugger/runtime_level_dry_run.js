#!/usr/bin/env node
"use strict";

// Full-level runtime acceptance harness. It intentionally uses the production
// CommandExecutor and the same browser-handler registration set as bootstrap.ts.
// The Pixi surface is a deterministic in-memory stand-in: resources, scene,
// level and event wiring are real; network, audio devices and user gestures are
// not required for a corpus quality gate.
require("ts-node/register/transpile-only");

const fs = require("fs");
const { CommandExecutor, BaseCommandHandler } = require("../src/core/CommandExecutor");
const { EventManager } = require("../src/core/EventManager");
const { StateManager } = require("../src/core/StateManager");
const { BrowserResourceManager } = require("../src/browser/BrowserResourceManager");
const { createDefaultHandlers } = require("../src/commands/factory");
const { PixiCreateDropZoneHandler } = require("../src/browser/PixiCreateDropZoneHandler");
const { PixiSetDraggableHandler } = require("../src/browser/PixiSetDraggableHandler");
const { PixiCheckInAreaHandler } = require("../src/browser/PixiCheckInAreaHandler");
const { AnimateInHandler } = require("../src/browser/AnimateInHandler");
const { AnimateOutHandler } = require("../src/browser/AnimateOutHandler");
const { AnimateLoopHandler } = require("../src/browser/AnimateLoopHandler");
const { PixiSetElementStyleHandler } = require("../src/browser/PixiSetElementStyleHandler");
const { FlipCardHandler } = require("../src/commands/FlipCardHandler");
const { SetClickableHandler } = require("../src/commands/SetClickableHandler");
const SetSelectableHandler = require("../src/commands/SetSelectableHandler").default;
const ChangeSelectStateHandler = require("../src/commands/ChangeSelectStateHandler").default;
const StopAnimationHandler = require("../src/commands/StopAnimationHandler").default;
const { FireworkBurstHandler } = require("../src/browser/FireworkBurstHandler");

const writeResult = process.stdout.write.bind(process.stdout);
const noOp = () => {};
console.log = noOp; console.info = noOp; console.warn = noOp; console.error = noOp;

// The gate verifies command contracts, not wall-clock duration. Bound RAF work
// so looping animation handlers cannot keep a Node process alive.
let rafBudget = 96;
global.requestAnimationFrame = (callback) => {
  const id = rafBudget--;
  if (id > 0) queueMicrotask(() => callback(performance.now() + 100000));
  return id;
};
global.cancelAnimationFrame = noOp;
global.setTimeout = (callback) => { queueMicrotask(callback); return 0; };
global.clearTimeout = noOp;
global.window = global;
global.window.addEventListener = noOp;
global.window.removeEventListener = noOp;
global.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: noOp }) };
global.localStorage = { getItem: () => null, setItem: noOp, removeItem: noOp };

class EmitterNode {
  constructor() {
    this.children = []; this.parent = null; this.x = 0; this.y = 0; this.width = 100; this.height = 100;
    this.alpha = 1; this.visible = true; this.renderable = true; this.rotation = 0; this.zIndex = 0;
    this.scale = { x: 1, y: 1, set: (x, y = x) => { this.scale.x = x; this.scale.y = y; } };
    this.anchor = { x: 0, y: 0, set: (x, y = x) => { this.anchor.x = x; this.anchor.y = y; } };
    this.transform = { position: {} }; this.listeners = new Map(); this.eventMode = "auto";
  }
  on(name, listener) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(listener); return this; }
  off(name, listener) { this.listeners.get(name)?.delete(listener); return this; }
  emit(name, data) { for (const listener of this.listeners.get(name) || []) listener(data); }
  async emitAsync(name, data) { for (const listener of this.listeners.get(name) || []) await listener(data); }
  addChild(...nodes) { for (const node of nodes) { if (node) { node.parent = this; this.children.push(node); } } return nodes[0]; }
  removeChild(node) { this.children = this.children.filter((child) => child !== node); if (node) node.parent = null; return node; }
  removeChildren() { const old = this.children; this.children = []; return old; }
  destroy() { this.destroyed = true; this.removeChildren(); }
  getBounds() { return { x: this.x, y: this.y, width: this.width || 0, height: this.height || 0 }; }
  sortChildren() {}
}

class FakeTexture {
  constructor(url) { this.baseTexture = { resource: { url } }; }
  static from(url) { return new FakeTexture(url); }
}
class FakeSprite extends EmitterNode { constructor(texture) { super(); this.texture = texture; } }
class FakeText extends EmitterNode { constructor(text) { super(); this.text = text; } }
class FakeGraphics extends EmitterNode { beginFill() { return this; } drawCircle() { return this; } endFill() { return this; } }
class FakeApplication {
  constructor() {
    this.stage = new EmitterNode();
    const callbacks = new Set();
    this.ticker = { deltaMS: 16.67, add: (fn) => callbacks.add(fn), remove: (fn) => callbacks.delete(fn), tick: () => callbacks.forEach((fn) => fn()) };
    this.screen = { x: 0, y: 0, width: 800, height: 600 };
    this.renderer = { width: 800, height: 600, generateTexture: () => new FakeTexture("data:image/png;base64,iVBORw0KGgo="), textureGC: { run: noOp } };
  }
}
const FakePixi = { Texture: FakeTexture, Sprite: FakeSprite, Text: FakeText, Container: EmitterNode, Graphics: FakeGraphics, BLEND_MODES: { NORMAL: 0, ADD: 1 } };
global.PIXI = FakePixi;

function makeElement(id, config) {
  const node = new EmitterNode();
  node.__content = new FakeSprite(FakeTexture.from(config.src || ""));
  node.__animLayer = node;
  node.__elementNode = {
    getBaseSnapshot: () => ({ x: node.x, y: node.y, resourceId: node.resourceId }),
    setBasePosition: (x, y) => { node.x = x; node.y = y; }, update: noOp,
    resetAnimation: noOp, clearLoopTimeline: noOp, setEntryTimeline: async () => {}, setLoopTimeline: async () => {},
  };
  node.resourceId = config.resourceId;
  node.x = Number(config.position?.x) || 0; node.y = Number(config.position?.y) || 0;
  node.width = Number(config.size?.width) || Number(config.width) || 100;
  node.height = Number(config.size?.height) || Number(config.height) || 100;
  node.visible = config.visible !== false;
  return node;
}

function makeRenderer(app) {
  const nodes = new Map(); const zones = new Map();
  const renderer = {
    app, getApp: () => app, getStage: () => app.stage, getPixi: () => FakePixi,
    getNode: (id) => nodes.get(id), getElement: (id) => nodes.get(id),
    createElement: (config) => { if (!config.id) throw new Error("element id missing"); const node = makeElement(config.id, config); nodes.set(config.id, node); app.stage.addChild(node); return node; },
    updateElement: (id, update) => {
      const node = nodes.get(id); if (!node) throw new Error(`element not found: ${id}`);
      if (update.position) { node.x = Number(update.position.x) || 0; node.y = Number(update.position.y) || 0; }
      if (update.visible !== undefined) node.visible = !!update.visible;
      if (update.scale) node.scale.set(update.scale.x ?? 1, update.scale.y ?? update.scale.x ?? 1);
      return node;
    },
    removeElement: (id) => { const node = nodes.get(id); node?.parent?.removeChild(node); nodes.delete(id); },
    addDropZone: (id, zone) => zones.set(id, zone), getDropZones: () => Array.from(zones, ([id, zone]) => ({ id, ...zone })),
    setExclusiveInteractive: noOp, clearExclusiveInteractive: noOp,
    animationAdapter: { moveTo: async (config) => { renderer.updateElement(config.elementId, { position: config.to }); config.onUpdate?.(1, config.to); config.onComplete?.(); return `dry-${config.elementId}`; } },
  };
  return renderer;
}

function makeAudioManager() { return new Proxy({}, { get: () => noOp }); }
function isCommand(value) { return value && typeof value === "object" && typeof value.type === "string"; }
function walkCommands(value, visit) {
  if (!Array.isArray(value)) return;
  for (const command of value) {
    if (!isCommand(command)) continue;
    visit(command);
    const p = command.parameters || {};
    for (const key of ["commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands"]) walkCommands(p[key], visit);
    for (const option of Array.isArray(p.options) ? p.options : []) walkCommands(option?.commands, visit);
  }
}

function validateLevelShape(level) {
  const errors = [];
  const allIds = new Set();
  walkCommands(level.commands, (command) => { if (!command.id) errors.push(`command missing id: ${command.type}`); else if (allIds.has(command.id)) errors.push(`duplicate command id: ${command.id}`); else allIds.add(command.id); });
  for (const event of level.events) {
    if (!event || !event.id || !Array.isArray(event.triggers) || !Array.isArray(event.commands)) errors.push("invalid EventConfig");
    walkCommands(event?.commands, (command) => { if (!command.id) errors.push(`command missing id: ${command.type}`); else if (allIds.has(command.id)) errors.push(`duplicate command id: ${command.id}`); else allIds.add(command.id); });
  }
  return errors;
}

async function flushTurns(app, count = 3) {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => queueMicrotask(resolve));
    app.ticker.tick();
  }
}

function pointerEvent(x, y) {
  return { data: { getLocalPosition: () => ({ x, y }) } };
}

async function waitForNode(renderer, app, id, ready = () => true) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const node = renderer.getNode(id);
    if (node && ready(node)) return node;
    await flushTurns(app, 1);
  }
  throw new Error(`interaction target was not ready: ${id}`);
}

async function runInteractionActions(actions, renderer, app, events, getActiveChoices = () => null) {
  const trace = [];
  for (const action of actions || []) {
    if (!action || typeof action !== "object") throw new Error("interaction action must be an object");
    const type = String(action.type || "").toLowerCase();
    if (type === "tap") {
      const node = await waitForNode(renderer, app, action.target, (candidate) => typeof candidate.__clickHandler === "function" || typeof candidate.__selectHandler === "function");
      const x = Number(action.x ?? node.x + node.width / 2);
      const y = Number(action.y ?? node.y + node.height / 2);
      await node.emitAsync("pointertap", pointerEvent(x, y));
      trace.push({ type, target: action.target, x, y });
    } else if (type === "drag") {
      const node = await waitForNode(renderer, app, action.target, (candidate) => !!candidate.__dragHandlers);
      const from = action.from || { x: node.x + node.width / 2, y: node.y + node.height / 2 };
      const to = action.to;
      if (!to || !Number.isFinite(Number(to.x)) || !Number.isFinite(Number(to.y))) throw new Error("drag action requires numeric to.x and to.y");
      await node.emitAsync("pointerdown", pointerEvent(Number(from.x), Number(from.y)));
      await app.stage.emitAsync("pointermove", pointerEvent(Number(to.x), Number(to.y)));
      await app.stage.emitAsync("pointerup", pointerEvent(Number(to.x), Number(to.y)));
      await flushTurns(app, 2);
      trace.push({ type, target: action.target, from, to });
    } else if (type === "emit") {
      if (typeof action.signal !== "string" || !action.signal) throw new Error("emit action requires signal");
      await events.emit(action.signal, action.data);
      trace.push({ type, signal: action.signal });
    } else if (type === "choose") {
      let choices = null;
      for (let attempt = 0; attempt < 24 && !choices; attempt += 1) {
        choices = getActiveChoices();
        if (!choices) await flushTurns(app, 1);
      }
      if (!choices) throw new Error("choice interaction was not ready");
      if (action.target && choices.elementId !== action.target) throw new Error(`active choices target mismatch: ${choices.elementId}`);
      const index = Number(action.index ?? 0);
      const option = choices.choices?.[index];
      if (!Number.isInteger(index) || index < 0 || !option) throw new Error(`choice index is unavailable: ${action.index}`);
      await events.emit("choice_selected", { commandId: choices.commandId, elementId: choices.elementId, optionId: option.id, index, text: option.text });
      trace.push({ type, target: choices.elementId, index, optionId: option.id, text: option.text });
    } else if (type === "advance_frames") {
      const frames = Number(action.frames);
      if (!Number.isInteger(frames) || frames < 1 || frames > 120) throw new Error("advance_frames requires frames from 1 to 120");
      await flushTurns(app, frames);
      trace.push({ type, frames });
    } else {
      throw new Error(`unsupported interaction action: ${action.type}`);
    }
  }
  return trace;
}

function evaluateAssertions(assertions, state, renderer, events, executed, eventExecutions, before = {}) {
  const results = [];
  for (const assertion of assertions || []) {
    const type = String(assertion?.type || "").toLowerCase();
    let actual; let expected; let passed = false;
    if (type === "variable_equals") {
      expected = assertion.value; actual = state.getVariable(assertion.name);
      passed = JSON.stringify(actual) === JSON.stringify(expected);
    } else if (type === "any_variable_equals") {
      expected = assertion.value; actual = Object.values(state.saveState().variables || {});
      passed = actual.some((value) => JSON.stringify(value) === JSON.stringify(expected));
    } else if (type === "variable_changed_after_actions") {
      expected = assertion.value;
      const previous = before.state?.variables || {};
      const current = state.saveState().variables || {};
      actual = Object.entries(current).filter(([key, value]) => JSON.stringify(previous[key]) !== JSON.stringify(value));
      passed = actual.some(([, value]) => JSON.stringify(value) === JSON.stringify(expected));
    } else if (type === "truthy_variable_count") {
      actual = Object.values(state.saveState().variables || {}).filter(Boolean).length;
      expected = Number(assertion.count ?? 1); passed = actual >= expected;
    } else if (type === "variable_truthy") {
      actual = state.getVariable(assertion.name); expected = true; passed = !!actual;
    } else if (type === "element_exists") {
      actual = !!renderer.getNode(assertion.target); expected = true; passed = actual;
    } else if (type === "element_position") {
      const node = renderer.getNode(assertion.target); const tolerance = Number(assertion.tolerance ?? 1);
      actual = node ? { x: node.x, y: node.y } : null; expected = { x: Number(assertion.x), y: Number(assertion.y) };
      passed = !!node && Math.abs(node.x - expected.x) <= tolerance && Math.abs(node.y - expected.y) <= tolerance;
    } else if (type === "element_property_equals") {
      const node = renderer.getNode(assertion.target); expected = assertion.value;
      actual = node ? node[assertion.property] : undefined; passed = JSON.stringify(actual) === JSON.stringify(expected);
    } else if (type === "event_emitted") {
      actual = events.getEventHistory(assertion.event).length; expected = Number(assertion.count ?? 1);
      passed = assertion.exact === true ? actual === expected : actual >= expected;
    } else if (type === "command_executed") {
      actual = executed.filter((item) => item.id === assertion.commandId && item.success).length; expected = Number(assertion.count ?? 1);
      passed = assertion.exact === true ? actual === expected : actual >= expected;
    } else if (type === "event_executed") {
      actual = eventExecutions.filter((item) => item.eventId === assertion.eventId).length; expected = Number(assertion.count ?? 1);
      passed = assertion.exact === true ? actual === expected : actual >= expected;
    } else if (type === "event_execution_count") {
      actual = eventExecutions.length; expected = Number(assertion.count ?? 1);
      passed = assertion.exact === true ? actual === expected : actual >= expected;
    } else if (type === "event_execution_after_actions") {
      actual = eventExecutions.length - Number(before.eventExecutionCount || 0); expected = Number(assertion.count ?? 1);
      passed = assertion.exact === true ? actual === expected : actual >= expected;
    } else {
      actual = "unsupported assertion"; expected = type; passed = false;
    }
    results.push({ type, passed, actual, expected, assertion });
  }
  return results;
}

async function runGame(game, evaluation = {}) {
  rafBudget = 96;
  const level = game?.levels?.[0];
  if (!level) throw new Error("game must contain one level");
  const shapeErrors = validateLevelShape(level);
  if (shapeErrors.length) return { valid: false, errors: shapeErrors, level };
  const app = new FakeApplication(); const events = new EventManager(); const state = new StateManager(events); const resources = new BrowserResourceManager();
  const renderer = makeRenderer(app); const audio = makeAudioManager(); const logger = { debug: noOp, info: noOp, warn: noOp, error: noOp };
  await resources.preloadResources(Array.isArray(game.resources) ? game.resources.map((r) => ({ id: r.id, type: r.type, url: r.url || r.src })) : []);
  for (const [key, value] of Object.entries(game.globalVariables || {})) state.setVariable(key, value);
  for (const [key, value] of Object.entries(level.initialState || {})) state.setVariable(key, value);
  state.setCurrentLevel(level.id || "runtime-validation-level");
  const executor = new CommandExecutor(state, events, resources, renderer, audio, logger);
  createDefaultHandlers().forEach((handler) => executor.registerHandler(handler));
  [new PixiCreateDropZoneHandler(), new PixiSetDraggableHandler(), new PixiCheckInAreaHandler(), new AnimateInHandler(), new AnimateOutHandler(), new AnimateLoopHandler(), new PixiSetElementStyleHandler(), new FlipCardHandler(), new SetClickableHandler(), new SetSelectableHandler(), new ChangeSelectStateHandler(), new StopAnimationHandler(), new FireworkBurstHandler()].forEach((handler) => executor.registerHandler(handler));
  class EventGroupHandler extends BaseCommandHandler { constructor(type) { super(); this.type = type; } async execute() { return this.createSuccessResult(); } validate() { return { valid: true, errors: [] }; } }
  executor.registerHandler(new EventGroupHandler("event_group")); executor.registerHandler(new EventGroupHandler("EVENT_GROUP"));
  const failures = []; const failureKeys = new Set(); const executed = []; const eventExecutions = [];
  const pendingEventTasks = new Set();
  let activeChoices = null;
  const hasInteractionEvaluation = Array.isArray(evaluation.actions) || Array.isArray(evaluation.assertions);
  const addFailure = (failure) => {
    const key = `${failure.eventId || ""}:${failure.commandId || failure.id || ""}:${failure.type || ""}:${failure.error || ""}`;
    if (!failureKeys.has(key)) { failureKeys.add(key); failures.push(failure); }
  };
  events.on("command_complete", ({ command, result }) => { executed.push({ id: command?.id, type: command?.type, success: !!result?.success, error: result?.error || null }); if (!result?.success) addFailure({ id: command?.id, type: command?.type, error: result?.error || "command failed" }); });
  // Corpus validation retains the old deterministic choice completion. Interaction
  // cases must provide their own operation script, so no implicit player input is
  // injected in that mode.
  if (!hasInteractionEvaluation) {
    events.on("choices_displayed", async (data) => { await events.emit("choice_selected", { commandId: data.commandId, elementId: data.elementId, index: 0 }); });
    events.on("text_displayed", (data) => {
      if (data?.blocking) queueMicrotask(() => events.emit("text_continue", { elementId: data.elementId }));
    });
  }
  if (hasInteractionEvaluation) {
    events.on("choices_displayed", (data) => { activeChoices = data; });
    events.on("choices_dismissed", () => { activeChoices = null; });
  }
  // EMIT_SIGNAL deliberately does not await listeners in the production
  // runtime. Track those tasks here so validation observes complete event
  // chains instead of relying on a timing-sensitive fixed microtask flush.
  const runEvent = (event, trigger, data) => {
    const task = (async () => {
      const results = await executor.executeCommands(event.commands || []);
      eventExecutions.push({ eventId: event.id, trigger, results: results.map((r) => ({ success: !!r.success, error: r.error || null })) });
      results.forEach((result, index) => { if (!result.success) addFailure({ eventId: event.id, commandId: event.commands?.[index]?.id, type: event.commands?.[index]?.type, error: result.error || "event command failed" }); });
    })();
    pendingEventTasks.add(task);
    task.then(() => pendingEventTasks.delete(task), () => pendingEventTasks.delete(task));
    return task;
  };
  const drainEventTasks = async () => {
    // A listener can emit another signal, adding work after an earlier task
    // resolves. Continue until the set is stable and empty.
    while (pendingEventTasks.size) await Promise.allSettled(Array.from(pendingEventTasks));
  };
  // The runtime registers event listeners before it starts the main command list.
  for (const event of level.events || []) {
    for (const trigger of event.triggers || []) {
      if (trigger?.type === "custom" && trigger.target) {
        events.on(trigger.target, (data) => runEvent(event, trigger.target, data));
      }
    }
  }
  for (const event of level.events || []) {
    if ((event.triggers || []).some((trigger) => trigger?.type === "auto" && trigger.start === "immediate")) {
      const results = await executor.executeCommands(event.commands || []);
      eventExecutions.push({ eventId: event.id, trigger: "auto:immediate", results: results.map((r) => ({ success: !!r.success, error: r.error || null })) });
      results.forEach((result, index) => { if (!result.success) addFailure({ eventId: event.id, commandId: event.commands?.[index]?.id, type: event.commands?.[index]?.type, error: result.error || "auto event command failed" }); });
    }
  }
  // Start the main flow before injecting actions. This deliberately supports a
  // blocking SET_CLICKABLE: the scripted tap resolves the real handler promise.
  const mainPromise = executor.executeCommands(level.commands || []);
  let interactionTrace = [];
  let interactionBefore = {};
  if (hasInteractionEvaluation) {
    await flushTurns(app, 3);
    interactionBefore = { state: state.saveState(), eventExecutionCount: eventExecutions.length };
    interactionTrace = await runInteractionActions(evaluation.actions || [], renderer, app, events, () => activeChoices);
  }
  const mainResults = await mainPromise;
  mainResults.forEach((result, index) => { if (!result.success) addFailure({ commandId: level.commands?.[index]?.id, type: level.commands?.[index]?.type, error: result.error || "main command failed" }); });
  if (hasInteractionEvaluation) await drainEventTasks();
  // Give handler-triggered microtasks (e.g. non-blocking animation cleanup) a deterministic turn.
  await flushTurns(app, 3);
  if (hasInteractionEvaluation) await drainEventTasks();
  const assertionResults = hasInteractionEvaluation ? evaluateAssertions(evaluation.assertions || [], state, renderer, events, executed, eventExecutions, interactionBefore) : [];
  for (const assertion of assertionResults.filter((item) => !item.passed)) addFailure({ type: "interaction_assertion", error: `${assertion.type}: expected ${JSON.stringify(assertion.expected)}, got ${JSON.stringify(assertion.actual)}` });
  return {
    valid: failures.length === 0,
    errors: failures,
    mainResults: mainResults.map((r) => ({ success: !!r.success, error: r.error || null })),
    eventExecutions,
    executed,
    interaction: hasInteractionEvaluation ? { actions: interactionTrace, assertions: assertionResults, passed: assertionResults.every((item) => item.passed) } : undefined,
    state: state.saveState(),
    registeredHandlers: executor.getRegisteredHandlers().length,
  };
}

async function main() {
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  if (Array.isArray(payload.games)) {
    const results = [];
    for (const entry of payload.games) {
      const game = entry?.game || entry;
      const evaluation = entry?.evaluation || {};
      try {
        const result = await runGame(game, evaluation);
        results.push(payload.compact ? {
          valid: result.valid,
          errors: result.errors,
          mainResultCount: result.mainResults?.length || 0,
          eventExecutionCount: result.eventExecutions?.length || 0,
          registeredHandlers: result.registeredHandlers,
        } : result);
      }
      catch (error) { results.push({ valid: false, errors: [{ error: error instanceof Error ? error.message : String(error) }] }); }
    }
    writeResult(JSON.stringify({ results }));
    return;
  }
  try { writeResult(JSON.stringify(await runGame(payload.game, payload.evaluation || {}))); }
  catch (error) { writeResult(JSON.stringify({ valid: false, errors: [{ error: error instanceof Error ? error.message : String(error) }] })); }
}

main();
