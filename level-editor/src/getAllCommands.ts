      // 创建事件映射
      const createEventMap = (level: any): Map<string, any> => {
        const eventMap = new Map();
        if (level.events && Array.isArray(level.events)) {
          level.events.forEach(event => {
            const trigger = event.triggers?.[0]?.condition?.expression;
            if (trigger) {
              // 从表达式中提取按钮事件名称
              const match = trigger.match(/event\.action === '(.+)'/);
              if (match) {
                const actionName = match[1];
                eventMap.set(actionName, event);
              }
            }
          });
        }
        return eventMap;
      };

      // 处理所有指令并保持层级结构
      const getAllCommands = (level: any): GameCommand[] => {
        const commands: GameCommand[] = [];
        const eventMap = createEventMap(level);
        
        // 处理主指令列表
        if (level.commands && Array.isArray(level.commands)) {
          level.commands.forEach((cmd: any) => {
            const processedCmd = processCommand(cmd, 0);
            
            // 如果是按钮指令，查找其对应的事件并作为子命令
            if (cmd.type === 'SHOW_BUTTON' && cmd.parameters?.onClick) {
              const event = eventMap.get(cmd.parameters.onClick);
              if (event) {
                processedCmd.children = event.commands.map(
                  (eventCmd: any) => processCommand(eventCmd, 1, processedCmd.id, event.name)
                );
              }
            }
            
            commands.push(processedCmd);
          });
        }

        // 展平树状结构，保持层级关系
        const flattenedCommands: GameCommand[] = [];
        const flatten = (cmd: GameCommand) => {
          flattenedCommands.push(cmd);
          if (cmd.children && cmd.children.length > 0) {
            cmd.children.forEach(child => {
              child.depth = (cmd.depth || 0) + 1;
              child.parentId = cmd.id;
              child.groupName = child.groupName || cmd.parameters?.name;
              flatten(child);
            });
          }
        };

        commands.forEach(cmd => flatten(cmd));
        return flattenedCommands;
      };

      const levels: LevelConfig[] = gameData.levels.map((level: any, index: number) => ({
        id: level.id || `level${index + 1}`,
        name: level.name || `关卡${index + 1}`,
        commands: getAllCommands(level),
        resources: level.resources || []
      }));
