// 错误类型定义
export enum ErrorType {
  // 系统错误
  SYSTEM = 'SYSTEM',
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  CRITICAL = 'CRITICAL',

  // API 相关错误
  API_KEY_INVALID = 'API_KEY_INVALID',
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  API_SERVICE_UNAVAILABLE = 'API_SERVICE_UNAVAILABLE',

  // 工具相关错误
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_PARAMS_INVALID = 'TOOL_PARAMS_INVALID',

  // DOM 操作错误
  DOM_ACCESS_DENIED = 'DOM_ACCESS_DENIED',
  DOM_HTML_FETCH_FAILED = 'DOM_HTML_FETCH_FAILED',
  DOM_SEMANTIC_ANALYSIS_FAILED = 'DOM_SEMANTIC_ANALYSIS_FAILED',
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',

  // 存储错误
  STORAGE_ERROR = 'STORAGE_ERROR',
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',

  // 扩展相关错误
  EXTENSION_PERMISSION_DENIED = 'EXTENSION_PERMISSION_DENIED',
  EXTENSION_INTERNAL_ERROR = 'EXTENSION_INTERNAL_ERROR',
}

// 统一的扩展错误接口
export interface ExtensionError {
  type: ErrorType;
  message: string;
  details?: any;
  timestamp: string;
  stack?: string;
  userFriendlyMessage?: string;
}

// 错误响应接口
export interface ErrorResponse {
  success: false;
  error: ExtensionError;
  toolName?: string;
  executionTime?: number;
}
