import { ILogger } from '../types';

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/**
 * 日志记录器实现
 */
export class Logger implements ILogger {
  private level: LogLevel = LogLevel.INFO;
  private prefix: string = '[GameRuntime]';

  constructor(level: LogLevel = LogLevel.INFO, prefix?: string) {
    this.level = level;
    if (prefix) {
      this.prefix = prefix;
    }
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * 设置日志前缀
   */
  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  /**
   * 调试日志
   */
  debug(message: string, data?: any): void {
    if (this.level <= LogLevel.DEBUG) {
      this.log('DEBUG', message, data);
    }
  }

  /**
   * 信息日志
   */
  info(message: string, data?: any): void {
    if (this.level <= LogLevel.INFO) {
      this.log('INFO', message, data);
    }
  }

  /**
   * 警告日志
   */
  warn(message: string, data?: any): void {
    if (this.level <= LogLevel.WARN) {
      this.log('WARN', message, data);
    }
  }

  /**
   * 错误日志
   */
  error(message: string, data?: any): void {
    if (this.level <= LogLevel.ERROR) {
      this.log('ERROR', message, data);
    }
  }

  /**
   * 内部日志方法
   */
  private log(level: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} ${this.prefix} [${level}] ${message}`;
    
    switch (level) {
      case 'DEBUG':
        console.debug(logMessage, data || '');
        break;
      case 'INFO':
        console.info(logMessage, data || '');
        break;
      case 'WARN':
        console.warn(logMessage, data || '');
        break;
      case 'ERROR':
        console.error(logMessage, data || '');
        break;
      default:
        console.log(logMessage, data || '');
    }
  }
}