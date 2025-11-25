import { ErrorType, ExtensionError } from '../types/error';
import { ToolResult } from '../../tools/types';

/**
 * 统一错误处理服务
 * 提供标准化的错误创建、处理和日志记录功能
 */
export class ErrorService {
  private static instance: ErrorService;

  private constructor() {
    // 私有构造函数，防止外部实例化
  }

  /**
   * 获取 ErrorService 单例实例
   */
  public static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService();
    }
    return ErrorService.instance;
  }

  /**
   * 创建标准化错误对象
   * @param type 错误类型
   * @param message 错误消息
   * @param originalError 原始错误对象（可选）
   * @param details 错误详情（可选）
   * @returns 标准化的错误对象
   */
  public createError(
    type: ErrorType,
    message: string,
    originalError?: Error,
    details?: any
  ): ExtensionError {
    const error: ExtensionError = {
      type,
      message,
      details,
      timestamp: new Date().toISOString(),
      stack: originalError?.stack || new Error().stack,
      userFriendlyMessage: this.getUserFriendlyMessage(type),
    };

    return error;
  }

  /**
   * 获取用户友好的错误消息
   * @param type 错误类型
   * @returns 用户友好的错误消息
   */
  private getUserFriendlyMessage(type: ErrorType): string {
    const userFriendlyMessages: Record<ErrorType, string> = {
      [ErrorType.SYSTEM]: '系统内部发生错误，请稍后重试',
      [ErrorType.NETWORK]: '网络连接失败，请检查您的网络设置',
      [ErrorType.TIMEOUT]: '操作超时，请稍后重试',
      [ErrorType.CRITICAL]: '发生严重错误，请刷新页面重试',
      [ErrorType.API_KEY_INVALID]: 'API 密钥无效，请检查您的配置',
      [ErrorType.API_RATE_LIMIT]: '请求频率过高，请稍后重试',
      [ErrorType.API_SERVICE_UNAVAILABLE]: 'AI 服务暂时不可用，请稍后重试',
      [ErrorType.TOOL_NOT_FOUND]: '找不到请求的工具',
      [ErrorType.TOOL_EXECUTION_FAILED]: '工具执行失败',
      [ErrorType.TOOL_PARAMS_INVALID]: '工具参数无效',
      [ErrorType.DOM_ACCESS_DENIED]: '无法访问页面元素',
      [ErrorType.DOM_HTML_FETCH_FAILED]: '获取页面内容失败',
      [ErrorType.DOM_SEMANTIC_ANALYSIS_FAILED]: '页面分析失败',
      [ErrorType.ELEMENT_NOT_FOUND]: '找不到指定的页面元素',
      [ErrorType.STORAGE_ERROR]: '数据存储失败',
      [ErrorType.ENCRYPTION_ERROR]: '数据加密/解密失败',
      [ErrorType.EXTENSION_PERMISSION_DENIED]: '扩展权限不足',
      [ErrorType.EXTENSION_INTERNAL_ERROR]: '扩展内部发生错误',
    };

    return userFriendlyMessages[type] || '发生未知错误';
  }

  /**
   * 记录详细错误日志
   * @param error 错误对象
   */
  public logError(error: ExtensionError): void {
    // 创建包含完整上下文的错误日志
    const errorLog = {
      timestamp: error.timestamp,
      type: error.type,
      message: error.message,
      userFriendlyMessage: error.userFriendlyMessage,
      stack: error.stack,
      details: this.sanitizeDetails(error.details),
    };

    // 根据错误类型决定日志级别
    if (error.type === ErrorType.CRITICAL) {
      console.error('[ERROR SERVICE] CRITICAL:', errorLog);
    } else {
      console.error('[ERROR SERVICE]', errorLog);
    }
  }

  /**
   * 清理敏感信息，保护用户隐私
   * @param details 错误详情
   * @returns 清理后的错误详情
   */
  private sanitizeDetails(details: any): any {
    if (!details) return details;

    // 深拷贝详情对象
    const sanitizedDetails = JSON.parse(JSON.stringify(details));

    // 定义需要清理的敏感字段
    const sensitiveFields = [
      'apiKey',
      'password',
      'token',
      'secret',
      'credentials',
      'auth',
    ];

    // 递归清理敏感字段
    const sanitizeObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
      }

      const sanitized: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const lowerKey = key.toLowerCase();
          const isSensitive = sensitiveFields.some(field =>
            lowerKey.includes(field.toLowerCase())
          );

          if (isSensitive) {
            sanitized[key] = '[REDACTED]';
          } else {
            sanitized[key] = sanitizeObject(obj[key]);
          }
        }
      }

      return sanitized;
    };

    return sanitizeObject(sanitizedDetails);
  }

  /**
   * 处理工具执行错误
   * @param toolName 工具名称
   * @param error 错误对象或消息
   * @param params 工具参数（可选）
   * @returns 符合 ToolResult 接口的错误响应
   */
  public handleToolError(
    toolName: string,
    error: any,
    params?: any
  ): ToolResult {
    // 确定错误类型
    let errorType: ErrorType;
    let errorMessage: string;
    let originalError: Error | undefined;

    if (error instanceof Error) {
      originalError = error;
      errorMessage = error.message;
      errorType = ErrorType.TOOL_EXECUTION_FAILED;
    } else {
      errorMessage = typeof error === 'string' ? error : '工具执行失败';
      errorType = ErrorType.TOOL_EXECUTION_FAILED;
    }

    // 创建标准化错误
    const standardError = this.createError(
      errorType,
      `工具 '${toolName}' 执行失败: ${errorMessage}`,
      originalError,
      {
        toolName,
        params: this.sanitizeDetails(params),
        originalError: originalError?.message,
      }
    );

    // 记录错误日志
    this.logError(standardError);

    // 返回符合 ToolResult 接口的错误响应
    return {
      success: false,
      error: standardError.userFriendlyMessage,
      toolName,
      executionTime: 0,
    };
  }

  /**
   * 格式化嵌套错误，提高可读性
   * @param error 错误对象
   * @returns 格式化后的错误字符串
   */
  public formatNestedError(error: any): string {
    if (!error) return '未知错误';

    if (error instanceof Error) {
      return this.formatErrorWithStack(error);
    }

    if (typeof error === 'object') {
      try {
        // 尝试格式化嵌套错误对象
        if (error.message) {
          let result = error.message;
          if (error.stack) {
            result += '\n' + error.stack;
          }
          // 递归处理内部错误
          if (error.innerError || error.cause) {
            const innerError = error.innerError || error.cause;
            result += '\nCaused by: ' + this.formatNestedError(innerError);
          }
          return result;
        }
      } catch (e) {
        // 如果格式化失败，返回简单表示
        return String(error);
      }
    }

    return String(error);
  }

  /**
   * 格式化错误并包含堆栈信息
   * @param error 错误对象
   * @returns 格式化后的错误字符串
   */
  private formatErrorWithStack(error: Error): string {
    if (!error.stack) {
      return error.message;
    }

    // 美化堆栈信息，只保留关键部分
    const stackLines = error.stack.split('\n').slice(0, 10); // 只保留前10行
    return `${error.message}\n${stackLines.join('\n')}`;
  }
}

// 导出单例实例
export const errorService = ErrorService.getInstance();
