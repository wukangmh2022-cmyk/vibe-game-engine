#!/usr/bin/env node
"use strict";

// Executes a compact command sample with the actual TypeScript CommandExecutor.
// It deliberately uses in-memory adapters: no DOM, network, audio device, or file
// writes are needed for this preflight.
require("ts-node/register/transpile-only");

const fs = require("fs");
const { CommandExecutor } = require("../src/core/CommandExecutor");
const { createDefaultHandlers } = require("../src/commands/factory");

// A dry run verifies handler contracts, not real-time duration. Never sleep while
// validating generated data.
global.setTimeout = (callback) => { queueMicrotask(callback); return 0; };
global.clearTimeout = noOp;

function noOp() {}

function makeStateManager() {
  const values = new Map();
  return {
    values,
    getVariable: (key) => values.get(key),
    setVariable: (key, value) => values.set(key, value),
    getSwitch: () => false,
    setSwitch: noOp,
    saveState: () => ({ currentLevel: "dry-run", variables: Object.fromEntries(values), switches: {}, score: 0, progress: 0, timestamp: 0 }),
    beginTempScope: noOp,
    endTempScope: noOp,
    hasActiveTempScope: () => false,
  };
}

function makeRenderManager() {
  const nodes = new Map();
  const apply = (node, update) => {
    Object.assign(node, update);
    if (update.position) {
      node.x = update.position.x;
      node.y = update.position.y;
    }
    return node;
  };
  return {
    nodes,
    getNode: (id) => nodes.get(id),
    getElement: (id) => nodes.get(id),
    createElement: (config) => {
      if (config.type === "image" && !config.src) throw new Error("image source was not resolved");
      const node = { ...config, x: config.position?.x || 0, y: config.position?.y || 0 };
      nodes.set(config.id, node);
      return node;
    },
    updateElement: (id, update) => {
      const node = nodes.get(id);
      if (!node) throw new Error(`element not found: ${id}`);
      return apply(node, update);
    },
    removeElement: (id) => nodes.delete(id),
    animationAdapter: {
      moveTo: async (config) => {
        const node = nodes.get(config.elementId);
        if (!node) throw new Error(`element not found: ${config.elementId}`);
        apply(node, { position: config.to });
        return "dry-run-move";
      },
    },
  };
}

function makeAudioManager() {
  return new Proxy({}, { get: () => async () => undefined });
}

function makeEventManager() {
  return {
    emit: noOp,
    on: noOp,
    off: noOp,
    once: (event, callback) => {
      // SHOW_CHOICES otherwise waits for browser input forever. Selecting the
      // first declared choice validates its nested command stream as well.
      if (event === "choice_selected") queueMicrotask(() => callback({ index: 0 }));
    },
    removeAllListeners: noOp,
    listenerCount: () => 0,
    eventNames: () => [],
  };
}

async function main() {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  const assets = Array.isArray(input.assets) ? input.assets : [];
  const resources = new Map(assets.map((asset) => [asset.id, { id: asset.id, type: asset.type, url: asset.path, src: asset.path }]));
  const stateManager = makeStateManager();
  const renderManager = makeRenderManager();
  const logger = { debug: noOp, info: noOp, warn: noOp, error: noOp };
  const executor = new CommandExecutor(
    stateManager,
    makeEventManager(),
    { getResource: (id) => resources.get(id) },
    renderManager,
    makeAudioManager(),
    logger,
  );
  createDefaultHandlers().forEach((handler) => executor.registerHandler(handler));

  const results = [];
  for (const command of input.commands || []) {
    const result = await executor.executeCommand(command);
    results.push({ id: command.id, type: command.type, success: !!result.success, error: result.error || null });
    if (!result.success) {
      process.stdout.write(JSON.stringify({ valid: false, results, state: Object.fromEntries(stateManager.values) }));
      return;
    }
  }
  process.stdout.write(JSON.stringify({ valid: true, results, state: Object.fromEntries(stateManager.values) }));
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({ valid: false, error: error instanceof Error ? error.message : String(error) }));
});
