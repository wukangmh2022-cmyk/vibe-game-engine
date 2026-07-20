import { BaseCommandHandler } from '../core/CommandExecutor';
import { GameCommand, CommandContext, CommandResult } from '../types';
import { RpgWorld } from './RpgWorld';

abstract class RpgCommandHandler extends BaseCommandHandler {
  validate(): { valid: boolean; errors: any[] } {
    return { valid: true, errors: [] };
  }
}

export class RpgLoadImageMapHandler extends RpgCommandHandler {
  readonly type = 'rpg_load_image_map' as any;
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    RpgWorld.fromContext(context).loadMap(p.mapId, p.spawnPointId, p.heroActorId);
    return this.createSuccessResult({ mapId: p.mapId });
  }
}

export class RpgSetActorHandler extends RpgCommandHandler {
  readonly type = 'rpg_set_actor' as any;
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    RpgWorld.fromContext(context).setActor(p.actorId, p);
    return this.createSuccessResult({ actorId: p.actorId });
  }
}

export class RpgMoveActorHandler extends RpgCommandHandler {
  readonly type = 'rpg_move_actor' as any;
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    await RpgWorld.fromContext(context).moveActor(p.actorId, p);
    return this.createSuccessResult({ actorId: p.actorId, x: p.x, y: p.y });
  }
}

export class RpgTransferActorHandler extends RpgCommandHandler {
  readonly type = 'rpg_transfer_actor' as any;
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    RpgWorld.fromContext(context).transferActor(p.actorId || 'actor.hero', p.targetMapId, p.targetSpawnPointId);
    return this.createSuccessResult({ actorId: p.actorId || 'actor.hero', targetMapId: p.targetMapId });
  }
}

export class RpgSetActorBehaviorHandler extends RpgCommandHandler {
  readonly type = 'rpg_set_actor_behavior' as any;
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    RpgWorld.fromContext(context).setBehavior(p.actorId, p.behavior || p);
    return this.createSuccessResult({ actorId: p.actorId, behavior: p.behavior || p });
  }
}

export class RpgSetCameraHandler extends RpgCommandHandler {
  readonly type = 'rpg_set_camera' as any;
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    RpgWorld.fromContext(context).setCamera(command.parameters || {});
    return this.createSuccessResult({ camera: command.parameters || {} });
  }
}

export class RpgMountHudHandler extends RpgCommandHandler {
  readonly type = 'rpg_mount_hud' as any;
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    RpgWorld.fromContext(context).mountHud(command.parameters || undefined);
    return this.createSuccessResult({ hud: true });
  }
}

export class RpgEmitNearbyInteractionHandler extends RpgCommandHandler {
  readonly type = 'rpg_emit_nearby_interaction' as any;
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    RpgWorld.fromContext(context).emitNearbyInteraction(p.actorId || 'actor.hero', Number(p.radius || 72));
    return this.createSuccessResult({ actorId: p.actorId || 'actor.hero' });
  }
}

export class RpgCheckPassabilityHandler extends RpgCommandHandler {
  readonly type = 'rpg_check_passability' as any;
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const x = Number(p.x || 0);
    const y = Number(p.y || 0);
    const passable = RpgWorld.fromContext(context).canStandAt(x, y);
    if (p.variableName) context.stateManager?.setVariable?.(p.variableName, passable);
    return this.createSuccessResult({ x, y, passable });
  }
}

export function createRpgHandlers() {
  return [
    new RpgLoadImageMapHandler(),
    new RpgSetActorHandler(),
    new RpgMoveActorHandler(),
    new RpgTransferActorHandler(),
    new RpgSetActorBehaviorHandler(),
    new RpgSetCameraHandler(),
    new RpgMountHudHandler(),
    new RpgEmitNearbyInteractionHandler(),
    new RpgCheckPassabilityHandler()
  ];
}
