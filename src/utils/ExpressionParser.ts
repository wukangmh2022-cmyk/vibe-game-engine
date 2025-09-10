import { IStateManager } from '../types';

/**
 * 表达式解析器
 * 支持变量替换和基本数学运算
 */
export class ExpressionParser {
  private stateManager: IStateManager;

  constructor(stateManager: IStateManager) {
    this.stateManager = stateManager;
  }

  /**
   * 解析表达式
   * @param expression 表达式字符串，如 "${score} + 10" 或 "${gold} - ${cost}"
   * @returns 计算结果
   */
  parse(expression: string): any {
    try {
      // 如果不包含变量引用，直接返回原值
      if (!expression.includes('${')) {
        return this.tryParseNumber(expression);
      }

      // 替换变量
      let processedExpression = this.replaceVariables(expression);
      
      // 如果替换后是纯数字，直接返回
      if (this.isNumeric(processedExpression)) {
        return parseFloat(processedExpression);
      }

      // 计算数学表达式
      return this.evaluateMathExpression(processedExpression);
    } catch (error) {
      console.warn('表达式解析失败:', expression, error);
      return expression; // 解析失败时返回原始字符串
    }
  }

  /**
   * 替换表达式中的变量
   */
  private replaceVariables(expression: string): string {
    return expression.replace(/\$\{([^}]+)\}/g, (match, variablePath) => {
      const trimmedPath = variablePath.trim();
      
      // 处理嵌套路径，如 gameState.gold -> gold
      let actualVariableName = trimmedPath;
      if (trimmedPath.startsWith('gameState.')) {
        actualVariableName = trimmedPath.substring('gameState.'.length);
      }
      
      const value = this.stateManager.getVariable(actualVariableName);
      if (value === undefined || value === null) {
        console.warn(`变量 ${actualVariableName} (原路径: ${trimmedPath}) 未定义，使用默认值 0`);
        return '0';
      }
      return String(value);
    });
  }

  /**
   * 计算数学表达式
   */
  private evaluateMathExpression(expression: string): number {
    // 移除空格
    expression = expression.replace(/\s+/g, '');
    
    // 安全的数学表达式计算
    // 只允许数字、基本运算符和括号
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
      throw new Error('表达式包含不安全的字符');
    }

    try {
      // 使用 Function 构造器安全地计算表达式
      const result = new Function('return ' + expression)();
      return typeof result === 'number' ? result : 0;
    } catch (error) {
      throw new Error('数学表达式计算失败: ' + error);
    }
  }

  /**
   * 检查字符串是否为数字
   */
  private isNumeric(str: string): boolean {
    // 去除空格
    str = str.trim();
    // 检查是否只包含数字、小数点和负号（且负号只能在开头）
    return /^-?\d+(\.\d+)?$/.test(str);
  }

  /**
   * 尝试将字符串解析为数字
   */
  private tryParseNumber(value: string): any {
    if (this.isNumeric(value)) {
      return parseFloat(value);
    }
    return value;
  }

  /**
   * 检查表达式是否包含变量引用
   */
  static hasVariables(expression: string): boolean {
    return typeof expression === 'string' && expression.includes('${');
  }

  /**
   * 提取表达式中的所有变量名
   */
  static extractVariables(expression: string): string[] {
    const matches = expression.match(/\$\{([^}]+)\}/g);
    if (!matches) return [];
    
    return matches.map(match => {
      const variableName = match.slice(2, -1).trim();
      return variableName;
    });
  }
}

/**
 * 创建表达式解析器实例
 */
export function createExpressionParser(stateManager: IStateManager): ExpressionParser {
  return new ExpressionParser(stateManager);
}