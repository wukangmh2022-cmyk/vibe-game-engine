/**
 * StateManager 单元测试
 */

import { StateManager } from '../src/core/StateManager';
import { EventManager } from '../src/core/EventManager';

describe('StateManager', () => {
  let stateManager: StateManager;
  let eventManager: EventManager;

  beforeEach(() => {
    eventManager = new EventManager();
    stateManager = new StateManager(eventManager);
  });

  describe('变量管理', () => {
    test('应该能够设置和获取变量', () => {
      stateManager.setVariable('testVar', 'testValue');
      expect(stateManager.getVariable('testVar')).toBe('testValue');
    });

    test('应该能够批量设置变量', () => {
      const variables = {
        var1: 'value1',
        var2: 42,
        var3: true
      };
      
      stateManager.setVariables(variables);
      
      expect(stateManager.getVariable('var1')).toBe('value1');
      expect(stateManager.getVariable('var2')).toBe(42);
      expect(stateManager.getVariable('var3')).toBe(true);
    });

    test('应该能够获取所有变量', () => {
      stateManager.setVariable('var1', 'value1');
      stateManager.setVariable('var2', 'value2');
      
      const allVariables = stateManager.getAllVariables();
      
      expect(allVariables).toEqual({
        var1: 'value1',
        var2: 'value2'
      });
    });

    test('应该能够删除变量', () => {
      stateManager.setVariable('testVar', 'testValue');
      expect(stateManager.getVariable('testVar')).toBe('testValue');
      
      stateManager.deleteVariable('testVar');
      expect(stateManager.getVariable('testVar')).toBeUndefined();
    });
  });

  describe('开关管理', () => {
    test('应该能够设置和获取开关', () => {
      stateManager.setSwitch('testSwitch', true);
      expect(stateManager.getSwitch('testSwitch')).toBe(true);
      
      stateManager.setSwitch('testSwitch', false);
      expect(stateManager.getSwitch('testSwitch')).toBe(false);
    });

    test('应该能够批量设置开关', () => {
      const switches = {
        switch1: true,
        switch2: false,
        switch3: true
      };
      
      stateManager.setSwitches(switches);
      
      expect(stateManager.getSwitch('switch1')).toBe(true);
      expect(stateManager.getSwitch('switch2')).toBe(false);
      expect(stateManager.getSwitch('switch3')).toBe(true);
    });

    test('应该能够获取所有开关', () => {
      stateManager.setSwitch('switch1', true);
      stateManager.setSwitch('switch2', false);
      
      const allSwitches = stateManager.getAllSwitches();
      
      expect(allSwitches).toEqual({
        switch1: true,
        switch2: false
      });
    });
  });

  describe('分数和进度管理', () => {
    test('应该能够设置和获取分数', () => {
      stateManager.setScore(100);
      expect(stateManager.getScore()).toBe(100);
    });

    test('应该能够增加分数', () => {
      stateManager.setScore(50);
      stateManager.addScore(25);
      expect(stateManager.getScore()).toBe(75);
    });

    test('应该能够设置和获取进度', () => {
      stateManager.setProgress(0.5);
      expect(stateManager.getProgress()).toBe(0.5);
    });
  });

  describe('关卡管理', () => {
    test('应该能够设置和获取当前关卡', () => {
      stateManager.setCurrentLevel('level2');
      expect(stateManager.getCurrentLevel()).toBe('level2');
    });
  });

  describe('状态重置', () => {
    test('应该能够重置所有状态', () => {
      stateManager.setVariable('testVar', 'value');
      stateManager.setSwitch('testSwitch', true);
      stateManager.setScore(100);
      stateManager.setCurrentLevel('level2');
      
      stateManager.reset();
      
      expect(stateManager.getAllVariables()).toEqual({});
      expect(stateManager.getAllSwitches()).toEqual({});
      expect(stateManager.getScore()).toBe(0);
      expect(stateManager.getCurrentLevel()).toBe('');
    });
  });

  describe('事件触发', () => {
    test('设置变量时应该触发事件', (done) => {
      eventManager.on('variable_changed', (data) => {
        expect(data.key).toBe('testVar');
        expect(data.newValue).toBe('testValue');
        expect(data.oldValue).toBeUndefined();
        done();
      });
      
      stateManager.setVariable('testVar', 'testValue');
    });

    test('设置开关时应该触发事件', (done) => {
      eventManager.on('switch_changed', (data) => {
        expect(data.key).toBe('testSwitch');
        expect(data.newValue).toBe(true);
        expect(data.oldValue).toBeUndefined();
        done();
      });
      
      stateManager.setSwitch('testSwitch', true);
    });
  });

  describe('统计信息', () => {
    test('应该能够获取统计信息', () => {
      stateManager.setVariable('var1', 'value1');
      stateManager.setVariable('var2', 'value2');
      stateManager.setSwitch('switch1', true);
      
      const stats = stateManager.getStats();
      
      expect(stats.variableCount).toBe(2);
      expect(stats.switchCount).toBe(1);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });
});