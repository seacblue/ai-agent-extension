import { generateId, getCurrentTimestamp } from './timeService';

// 类型定义
export interface Message {
  id: number;
  type: 'USER' | 'ASSISTANT' | 'THINKING';
  content: string;
  timestamp: string;
  status: 'success' | 'error';
  completed?: boolean;
  thinkingSteps?: ThinkingStep[];
}

export interface ThinkingStep {
  id: number;
  content: string;
  timestamp: string;
}

export interface SelectedElement {
  id: string;
  elementData: any;
  timestamp: number;
}

export interface MessageServiceOptions {
  onMessageAdded?: (message: Message) => void;
  onStreamingStarted?: () => void;
  onStreamingUpdated?: (content: string) => void;
  onStreamingComplete?: () => void;
  onError?: (error: string) => void;
}

/**
 * 消息服务 - 负责处理消息的发送、接收和流式传输
 */
export class MessageService {
  private currentRequestId: string | null = null;

  /**
   * 生成元素信息摘要
   */
  public static generateElementSummary(elementData: any): string {
    if (!elementData) return '未知元素';

    const tagName = elementData.tagName || '未知标签';
    const className = elementData.className
      ? `.${elementData.className.split(' ').join('.')}`
      : '';
    const id = elementData.id ? `#${elementData.id}` : '';
    const text = elementData.text
      ? elementData.text.substring(0, 20) +
        (elementData.text.length > 20 ? '...' : '')
      : '';

    return `${tagName}${id}${className}${text ? ` "${text}"` : ''}`;
  }
  private panelPort: chrome.runtime.Port | null = null;
  private connectionRetryCount = 0;
  private readonly baseConnectionRetryDelay = 1000; // 基础重连延迟
  private readonly maxConnectionRetryDelay = 30000; // 最大重连延迟(30秒)

  // 流式传输相关
  private isStreaming = false;
  public currentStreamingMessage: Message | null = null;
  private accumulatedContent = '';

  // 回调函数
  private onMessageAdded?: (message: Message) => void;
  private onStreamingStarted?: () => void;
  private onStreamingUpdated?: (content: string) => void;
  private onStreamingComplete?: () => void;
  private onError?: (error: string) => void;

  constructor(options?: MessageServiceOptions) {
    this.onMessageAdded = options?.onMessageAdded;
    if (options?.onStreamingStarted) {
      this.onStreamingStarted = options.onStreamingStarted.bind(this);
    }
    if (options?.onStreamingUpdated) {
      this.onStreamingUpdated = options.onStreamingUpdated.bind(this);
    }
    this.onStreamingComplete = options?.onStreamingComplete;
    this.onError = options?.onError;

    this.handleStreamingContent = this.handleStreamingContent.bind(this);
    this.handleBackgroundResponse = this.handleBackgroundResponse.bind(this);
    this.finishThinkingProcess = this.finishThinkingProcess.bind(this);
    this.addThinkingMessage = this.addThinkingMessage.bind(this);

    // 发送欢迎信息
    this.sendWelcomeMessage();
  }

  /**
   * 发送欢迎信息
   */
  private sendWelcomeMessage(): void {
    // 添加一个小延迟确保组件已经初始化完成
    setTimeout(() => {
      this.addAssistantMessage(
        '你好！我是AI开发者助手，可以帮你分析页面DOM结构、CSS样式、网络请求等。有什么问题尽管问我！',
        'success'
      );
    }, 100);
  }

  /**
   * 建立与 Background 的长连接
   */
  public establishConnection(): chrome.runtime.Port | null {
    if (this.panelPort) {
      console.log('长连接已存在，跳过建立');
      return this.panelPort;
    }

    console.log('正在建立与 Background 的长连接...');
    try {
      this.panelPort = chrome.runtime.connect({ name: 'question-response' });

      this.panelPort.onMessage.addListener(message => {
        console.log('Panel 收到长连接消息: ', message);
        this.handleBackgroundResponse(message);
      });

      this.panelPort.onDisconnect.addListener(() => {
        console.log('Panel 长连接已断开');
        this.panelPort = null;

        // 检查是否需要重连
        if (chrome.runtime.lastError) {
          console.error('连接断开原因: ', chrome.runtime.lastError.message);

          // 如果不是主动断开，则尝试重连
          this.connectionRetryCount++;

          // 实现指数退避策略
          const retryDelay = Math.min(
            this.baseConnectionRetryDelay *
              Math.pow(2, this.connectionRetryCount - 1),
            this.maxConnectionRetryDelay
          );

          console.log(
            `尝试重连 #${this.connectionRetryCount} (延迟 ${retryDelay}ms)...`
          );
          setTimeout(() => {
            this.establishConnection();
          }, retryDelay);
        } else {
          // 主动断开连接时重置重试计数
          this.connectionRetryCount = 0;
          console.log('长连接主动断开');
        }
      });

      // 连接成功
      this.connectionRetryCount = 0;
      console.log('Panel 长连接建立成功');

      return this.panelPort;
    } catch (error) {
      console.error('建立长连接失败: ', error);
      this.panelPort = null;

      // 发生错误时也尝试重连
      this.connectionRetryCount++;
      const retryDelay = Math.min(
        this.baseConnectionRetryDelay *
          Math.pow(2, this.connectionRetryCount - 1),
        this.maxConnectionRetryDelay
      );

      console.log(
        `建立连接发生错误，尝试重连 #${this.connectionRetryCount} (延迟 ${retryDelay}ms)...`
      );
      setTimeout(() => {
        this.establishConnection();
      }, retryDelay);

      return null;
    }
  }

  /**
   * 发送消息到 Background
   */
  public async sendMessage(
    userInputText: string,
    selectedElement: SelectedElement | null,
    onSendingStateChange?: (isSending: boolean) => void
  ): Promise<void> {
    if (!userInputText.trim()) return;

    onSendingStateChange?.(true);

    // 如果有之前的请求，先取消它
    if (this.currentRequestId) {
      try {
        await chrome.runtime.sendMessage({
          type: 'TERMINATE_PROCESS',
          requestId: this.currentRequestId,
        });
      } catch (error) {
        console.warn('取消之前请求失败: ', error);
      }
    }

    // 生成新的请求 ID
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.currentRequestId = requestId;

    // 构建包含元素信息的完整问题
    let fullQuestion = userInputText;
    if (selectedElement && selectedElement.elementData) {
      const elementInfo = selectedElement.elementData;
      const elementSummary = MessageService.generateElementSummary(elementInfo);

      // 将元素信息作为上下文附加到问题中
      fullQuestion = `${userInputText}

---
**元素上下文信息:**
- 元素: ${elementSummary}
- 标签: ${elementInfo.tagName}
- ID: ${elementInfo.id || '无'}
- 类名: ${elementInfo.className || '无'}
- 文本内容: ${elementInfo.textContent ? elementInfo.textContent.substring(0, 100) + (elementInfo.textContent.length > 100 ? '...' : '') : '无'}
- 位置: x=${elementInfo.rect?.x || 0}, y=${elementInfo.rect?.y || 0}
- 尺寸: ${elementInfo.rect?.width || 0}x${elementInfo.rect?.height || 0}
---`;

      console.log('将元素信息附加到问题中: ', elementSummary);
    }

    // 添加一个小延迟确保 UI 更新
    await new Promise(resolve => setTimeout(resolve, 100));

    const userMessage: Message = {
      id: generateId(),
      type: 'USER',
      content: userInputText,
      timestamp: getCurrentTimestamp(),
      status: 'success',
    };

    // 触发消息添加回调
    this.onMessageAdded?.(userMessage);

    const thinkingMessage: Message = {
      id: generateId(),
      type: 'THINKING',
      content: '',
      timestamp: getCurrentTimestamp(),
      status: 'success',
      completed: false,
      thinkingSteps: [],
    };

    // 触发思考消息添加回调
    this.onMessageAdded?.(thinkingMessage);

    // 发送消息到 Background Script
    try {
      // 首先建立长连接
      const port = this.establishConnection();
      if (!port) {
        throw new Error('无法建立与 Background 的长连接');
      }

      // 尝试获取当前标签页信息
      let tabId = null;

      try {
        // 在 DevTools 中，我们需要通过 chrome.devtools.inspectedWindow 获取标签页 ID
        if (chrome.devtools && chrome.devtools.inspectedWindow) {
          tabId = chrome.devtools.inspectedWindow.tabId;
          console.log('从 DevTools 获取到标签页 ID: ', tabId);
        }
      } catch (devtoolsError) {
        console.warn('无法从 DevTools 获取标签页 ID: ', devtoolsError);
      }

      const response = await chrome.runtime.sendMessage({
        type: 'ASK_QUESTION',
        question: fullQuestion, // 使用包含元素信息的完整问题
        tabId, // 传递标签页 ID
        requestId, // 传递请求 ID
      });

      // 检查响应是否匹配当前请求 ID
      if (response && response.requestId === this.currentRequestId) {
        this.handleBackgroundResponse(response);
      } else {
        console.log('忽略过期请求的响应: ', response);
      }
    } catch (error) {
      this.finishThinkingProcess();
      console.error('发送消息失败: ', error);
      this.onError?.('抱歉，处理您的问题时遇到了错误，请稍后再试。');
      onSendingStateChange?.(false);
      this.currentRequestId = null;
    }
  }

  /**
   * 终止当前消息处理
   */
  public async terminateMessage(
    onSendingStateChange?: (isSending: boolean) => void
  ): Promise<void> {
    onSendingStateChange?.(false);
    this.finishThinkingProcess();
    this.currentRequestId = null; // 清理请求 ID

    // 向 Background 发送终止消息
    try {
      await chrome.runtime.sendMessage({
        type: 'TERMINATE_PROCESS',
      });
    } catch (error) {
      console.error('发送终止消息失败: ', error);
    }

    // 处理流式传输中断
    if (this.isStreaming) {
      this.handleStreamingInterrupt(onSendingStateChange);
    }
  }

  /**
   * 处理后台响应
   */
  public handleBackgroundResponse(response: any): void {
    if (!response) {
      this.finishThinkingProcess();
      this.onError?.('未收到有效响应');
      this.currentRequestId = null;
      return;
    }

    switch (response.type) {
      case 'THINKING':
        this.finishThinkingProcess();
        // 显示思考过程
        if (response.content) {
          this.addThinkingMessage(response.content);
        }
        break;

      case 'STREAMING_CONTENT':
        // 处理流式内容，实现实时拼接
        if (response.content) {
          // 确保isFirstChunk参数有默认值，避免undefined导致的问题
          const isFirstChunk = response.isFirstChunk ?? false;
          this.handleStreamingContent(response.content, isFirstChunk);
        }
        break;

      case 'STREAMING_COMPLETE':
        // 流式完成，恢复时间戳显示
        this.isStreaming = false;
        if (this.currentStreamingMessage) {
          this.currentStreamingMessage.timestamp = getCurrentTimestamp();
          this.currentStreamingMessage = null;
        }
        this.accumulatedContent = ''; // 重置累积内容
        this.currentRequestId = null; // 清理请求 ID

        // 触发流式完成回调
        this.onStreamingComplete?.();
        break;

      case 'ERROR':
        // 处理错误信息，支持不同类型的错误
        if (response.error) {
          this.finishThinkingProcess();

          // 处理流式传输中断
          if (this.isStreaming) {
            this.handleStreamingInterrupt();
          } else {
            this.addAssistantMessage(response.error, 'error');
          }
          this.onError?.(response.error);
        }
        this.currentRequestId = null; // 清理请求 ID
        break;

      case 'CONNECTION_ACK':
        console.log('长连接已确认: ', response.portId);
        break;

      case 'ELEMENT_SELECTED_RESULT':
        // 这个消息由 App.vue 处理
        break;

      default:
        // 兼容旧格式，统一处理
        this.finishThinkingProcess();
        {
          const content = response.answer || response.content || response.error;
          if (content) {
            const status = response.error ? 'error' : 'success';
            const message: Message = {
              id: generateId(),
              type: 'ASSISTANT',
              content,
              timestamp: getCurrentTimestamp(),
              status,
            };
            this.onMessageAdded?.(message);
          } else {
            // 记录未知响应格式
            console.warn('收到未知格式的响应: ', response);
            this.onError?.('收到未知格式的响应');
          }
        }
        this.currentRequestId = null; // 清理请求 ID
    }
  }

  /**
   * 处理流式内容的实时拼接
   */
  private handleStreamingContent(chunk: string, isFirstChunk: boolean): void {
    this.isStreaming = true;

    if (isFirstChunk) {
      this.finishThinkingProcess();

      // 重置累积内容并创建新的 assistant 消息
      this.accumulatedContent = chunk;

      this.currentStreamingMessage = {
        id: generateId(),
        type: 'ASSISTANT',
        content: this.accumulatedContent,
        timestamp: '', // 流式传输期间不显示时间戳
        status: 'success',
      };

      // 触发消息添加和流式开始回调
      this.onMessageAdded?.(this.currentStreamingMessage);
      this.onStreamingStarted?.();
    } else if (this.currentStreamingMessage) {
      // 后续数据块，累积内容并更新消息
      this.accumulatedContent += chunk;
      this.currentStreamingMessage.content = this.accumulatedContent;

      // 触发流式更新回调
      this.onStreamingUpdated?.(this.accumulatedContent);
    } else {
      // 没有当前流式消息但收到非首个数据块，重新初始化
      console.warn('收到非首个数据块但没有当前流式消息，重新初始化');
      this.accumulatedContent = chunk;

      this.currentStreamingMessage = {
        id: generateId(),
        type: 'ASSISTANT',
        content: this.accumulatedContent,
        timestamp: '',
        status: 'success',
      };

      // 触发消息添加和流式开始回调
      this.onMessageAdded?.(this.currentStreamingMessage);
      this.onStreamingStarted?.();
    }
  }

  /**
   * 处理流式传输中断
   */
  public handleStreamingInterrupt(
    onSendingStateChange?: (isSending: boolean) => void
  ): void {
    this.isStreaming = false;
    onSendingStateChange?.(false);

    if (this.currentStreamingMessage) {
      this.currentStreamingMessage.timestamp = getCurrentTimestamp();
      this.currentStreamingMessage = null;
    }
  }

  /**
   * 添加思考消息
   */
  public addThinkingMessage(content: string): void {
    const stepId = generateId();
    const newStep: ThinkingStep = {
      id: stepId,
      content,
      timestamp: getCurrentTimestamp(),
    };

    const thinkingMessage: Message = {
      id: generateId(),
      type: 'THINKING',
      content: '',
      timestamp: getCurrentTimestamp(),
      status: 'success',
      thinkingSteps: [newStep],
    };

    this.onMessageAdded?.(thinkingMessage);
  }

  /**
   * 完成思考过程
   */
  public finishThinkingProcess(): void {
    // 发送思考完成事件
    const thinkingCompleteMessage: Message = {
      id: generateId(),
      type: 'THINKING',
      content: '',
      timestamp: getCurrentTimestamp(),
      status: 'success',
      completed: true,
      thinkingSteps: [],
    };

    this.onMessageAdded?.(thinkingCompleteMessage);
  }

  /**
   * 添加助手消息
   */
  public addAssistantMessage(
    content: string,
    status: 'success' | 'error' = 'success'
  ): Message {
    const message: Message = {
      id: generateId(),
      type: 'ASSISTANT',
      content,
      timestamp: getCurrentTimestamp(),
      status,
    };

    this.onMessageAdded?.(message);
    return message;
  }

  /**
   * 获取当前状态
   */
  public getStatus(): {
    isStreaming: boolean;
    isSending: boolean;
    currentRequestId: string | null;
  } {
    return {
      isStreaming: this.isStreaming,
      isSending: this.currentRequestId !== null,
      currentRequestId: this.currentRequestId,
    };
  }
}
