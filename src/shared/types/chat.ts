// 聊天消息相关的共享接口定义

/**
 * 思考步骤接口
 */
export interface ThinkingStep {
  id: number;
  content: string;
  timestamp: string;
}

/**
 * 聊天消息接口
 */
export interface Message {
  id: number;
  type: 'USER' | 'ASSISTANT' | 'THINKING';
  content: string;
  timestamp: string;
  status: 'success' | 'error';
  completed?: boolean;
  thinkingSteps?: ThinkingStep[];
}

/**
 * 元素信息接口
 */
export interface ElementInfo {
  id: string;
  elementData: any;
  timestamp: number;
}
