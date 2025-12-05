// AI 服务封装
import { DoubaoAIClient, ChatMessage } from './aiClient';
import { getApiKeyFromStorage } from './api';
import { PromptUtils } from './prompt';

/**
 * 分析决策接口
 */
export interface AnalysisDecision {
  shouldAnalyzeDOM: boolean;
  shouldAnalyzeCSS: boolean;
  targetElement?: string;
}

/**
 * AI 服务选项接口
 */
export interface AIServiceOptions {
  onChunk?: (chunk: string, isFirstChunk: boolean) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onThinking?: (content: string) => void;
}

/**
 * 问题处理选项接口
 */
export interface QuestionOptions {
  question: string;
  requestId: string;
  sender: chrome.runtime.MessageSender;
  sendResponse: (response: any) => void;
  panelPort?: chrome.runtime.Port | null;
  getApiKeyFromStorage?: () => Promise<string>;
  LongConnectionManager?: any;
}

/**
 * 终止任务选项接口
 */
export interface TerminateOptions {
  responseMethod: 'sendResponse' | 'portMessage';
  sendResponse?: (response: any) => void;
  port?: chrome.runtime.Port;
  requestId?: string;
}

/**
 * AI 服务类，封装所有 AI 相关功能，包括进程管理和任务协调
 */
export class AIService {
  private aiClient: DoubaoAIClient | null = null;
  private abortController: AbortController | null = null;
  private currentAIProcess: { abort: () => void } | null = null;
  private static instance: AIService;

  /**
   * 获取 AI 服务单例实例
   */
  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * 初始化 AI 客户端
   * @param apiKey - API 密钥
   * @returns 是否初始化成功
   */
  private async initializeClient(apiKey?: string): Promise<boolean> {
    try {
      const key = apiKey || (await getApiKeyFromStorage());
      if (!key || key.trim() === '') {
        throw new Error('API 密钥未配置');
      }
      this.aiClient = new DoubaoAIClient(key);
      return true;
    } catch (error) {
      console.error('初始化 AI 客户端失败:', error);
      return false;
    }
  }

  /**
   * 分析用户问题，决定是否需要使用DOM和CSS分析工具
   * @param question - 用户问题
   * @param onError - 错误回调
   * @returns 分析决策结果
   */
  public async analyzeQuestionRequirements(
    question: string,
    onError?: (error: string) => void
  ): Promise<AnalysisDecision> {
    try {
      const isClientReady = await this.initializeClient();
      if (!isClientReady || !this.aiClient) {
        throw new Error('AI 客户端初始化失败');
      }

      const analysisPrompt = `
分析用户的问题，判断是否需要使用 DOM 分析工具和 CSS 分析工具来回答。

用户问题：${question}

请返回一个 JSON 格式的分析结果，包含以下字段：
- shouldAnalyzeDOM: boolean - 是否需要分析页面 DOM 结构
- shouldAnalyzeCSS: boolean - 是否需要分析页面 CSS 样式
- targetElement: string (可选) - 如果需要分析特定元素，提供 CSS 选择器

判断标准：
1. 如果问题涉及页面结构、元素内容、文本信息等，需要 DOM 分析
2. 如果问题涉及样式、布局、设计等，需要 CSS 分析
3. 如果问题涉及特定元素，提供准确的选择器

只返回 JSON，不要其他内容。`;

      const messages: ChatMessage[] = [
        {
          role: 'system',
          content:
            '你是一个专业的分析助手，擅长判断用户问题的分析需求。只返回 JSON 格式的结果。',
        },
        {
          role: 'user',
          content: analysisPrompt,
        },
      ];

      const response = await this.aiClient.sendMessage(messages);
      console.log('AI 分析响应:', JSON.stringify(response, null, 2));

      try {
        const content = response.choices?.[0]?.message?.content || '';
        const result = JSON.parse(content);

        return {
          shouldAnalyzeDOM: Boolean(result.shouldAnalyzeDOM),
          shouldAnalyzeCSS: Boolean(result.shouldAnalyzeCSS),
          targetElement: result.targetElement || undefined,
        };
      } catch (parseError) {
        console.error('分析响应解析失败: ', parseError);
        return { shouldAnalyzeDOM: false, shouldAnalyzeCSS: false };
      }
    } catch (error) {
      console.error('问题分析失败:', error);
      if (onError) {
        onError('API 密钥未配置，请在设置中配置豆包 AI API 密钥');
      }
      return { shouldAnalyzeDOM: false, shouldAnalyzeCSS: false };
    }
  }

  /**
   * 发送消息到 AI 并获取流式响应
   * @param question - 用户问题
   * @param domData - DOM 分析数据
   * @param cssData - CSS 分析数据
   * @param options - 选项配置
   * @returns Promise<void>
   */
  public async sendMessageWithStream(
    question: string,
    domData?: string,
    cssData?: string,
    options: AIServiceOptions = {}
  ): Promise<void> {
    try {
      // 清理之前的请求
      this.cleanup();

      const isClientReady = await this.initializeClient();
      if (!isClientReady || !this.aiClient) {
        throw new Error('API 密钥未配置，请在设置中配置豆包 AI API 密钥');
      }

      // 创建 AbortController
      this.abortController = new AbortController();

      // 使用 PromptUtils 构建提示词
      const fullPrompt = PromptUtils.buildPrompt({
        question,
        domData,
        cssData,
      });

      let isFirstChunk = true;

      // 发送流式消息
      await this.aiClient.sendMessageStream(
        [
          {
            role: 'system',
            content:
              '你是一个专业的网页分析和开发助手，专门帮助用户完成网页相关的任务。你需要分析页面结构、CSS样式、DOM元素等，并提供解决方案。请始终使用中文回答用户的问题。无论用户使用什么语言提问，都要用中文回复。',
          },
          {
            role: 'user',
            content: fullPrompt,
          },
        ],
        // onChunk - 处理每个数据块
        (chunk: string) => {
          if (options.onChunk) {
            options.onChunk(chunk, isFirstChunk);
          }
          isFirstChunk = false;
        },
        // onComplete - 流式完成
        () => {
          this.abortController = null;
          this.currentAIProcess = null;
          if (options.onComplete) {
            options.onComplete();
          }
        },
        // onError - 错误处理
        (error: Error) => {
          this.abortController = null;
          this.currentAIProcess = null;
          console.error('流式 API 调用失败: ', error);
          if (options.onError) {
            options.onError(error);
          }
        },
        // abortSignal - 中断信号
        this.abortController.signal
      );
    } catch (error) {
      this.abortController = null;
      this.currentAIProcess = null;
      console.error('AI 调用过程中出错: ', error);
      if (options.onError) {
        options.onError(error as Error);
      }
    }
  }

  /**
   * 处理用户问题
   * @param options - 问题处理选项
   */
  public async handleQuestion(options: QuestionOptions): Promise<void> {
    let currentPanelPort: chrome.runtime.Port | null = null;
    const {
      question,
      requestId,
      sender,
      sendResponse,
      panelPort: incomingPanelPort,
      getApiKeyFromStorage,
      LongConnectionManager,
    } = options;

    try {
      // 检查是否已经有 Panel 连接
      if (incomingPanelPort) {
        currentPanelPort = incomingPanelPort;
        console.log('使用传入的 Panel 连接');

        // 发送连接确认
        try {
          // 在发送消息前检查 port 是否有效
          if (currentPanelPort && currentPanelPort.sender) {
            currentPanelPort.postMessage({
              type: 'CONNECTION_ACK',
              timestamp: new Date().toISOString(),
            });
            console.log('发送连接确认成功');
          } else {
            console.warn('连接已断开或无效，无法发送确认');
            currentPanelPort = null;
          }
        } catch (error) {
          console.error('发送连接确认失败: ', error);
          currentPanelPort = null;
        }
      }

      const analysisDecision = await this.analyzeQuestionRequirements(question);
      let tabId = (sender as any).tabId || sender.tab?.id;
      if (!tabId) {
        const tabs = await chrome.tabs.query({});
        const activeTab = tabs.find(tab => tab.active) || tabs[0];
        tabId = activeTab?.id;
      }
      if (!tabId) {
        if (currentPanelPort) {
          try {
            currentPanelPort.postMessage({
              type: 'ERROR',
              error: '无法获取当前标签页信息，请确保在网页上打开 DevTools',
              requestId: requestId,
            });
          } catch (error) {
            console.error('发送标签页错误失败: ', error);
          }
        }
        return;
      }

      let domData: string | undefined;
      let cssData: string | undefined;

      // DOM 分析
      if (
        analysisDecision.shouldAnalyzeDOM &&
        LongConnectionManager &&
        currentPanelPort
      ) {
        try {
          if (currentPanelPort) {
            currentPanelPort.postMessage({
              type: 'THINKING',
              content: '正在使用 DOM 分析工具...',
              requestId: requestId,
            });
          }

          const connectionManager = LongConnectionManager.getInstance();
          const domResult = await connectionManager.sendLongConnectionRequest(
            tabId!,
            'EXECUTE_TOOLS',
            {
              keywords: ['getDOM'],
              params: {
                domOptions: {
                  includeStyles: false,
                  includeAttributes: true,
                  maxDepth: 5,
                },
                htmlOptions: {
                  format: true,
                  includeDoctype: false,
                },
              },
              context: {
                tabId,
                question,
                timestamp: new Date().toISOString(),
              },
            },
            'dom-analysis-result',
            15000
          );

          if (
            domResult.success &&
            domResult.results &&
            domResult.results.length > 0
          ) {
            domData = PromptUtils.truncateData(domResult.results[0].data, 8000);
          } else {
            console.warn('DOM 分析未返回有效结果');
          }
        } catch (error) {
          console.error('DOM 分析失败: ', error);
        }
      }

      // CSS 分析
      if (
        analysisDecision.shouldAnalyzeCSS &&
        LongConnectionManager &&
        currentPanelPort
      ) {
        try {
          if (currentPanelPort) {
            currentPanelPort.postMessage({
              type: 'THINKING',
              content: '正在使用 CSS 分析工具...',
              requestId: requestId,
            });
          }

          const connectionManager = LongConnectionManager.getInstance();
          const cssResult = await connectionManager.sendLongConnectionRequest(
            tabId!,
            'EXECUTE_TOOLS',
            {
              keywords: ['cssAnalyzer'],
              params: {
                naturalQuery: question,
                targetElement: analysisDecision.targetElement,
                includeAll: false,
              },
              context: {
                tabId,
                question,
                timestamp: new Date().toISOString(),
              },
            },
            'css-analysis-result',
            15000
          );

          if (
            cssResult.success &&
            cssResult.results &&
            cssResult.results.length > 0
          ) {
            cssData = PromptUtils.truncateData(cssResult.results[0].data, 5000);
          } else {
            console.warn('CSS 分析未返回有效结果');
          }
        } catch (error) {
          console.error('CSS 分析失败: ', error);
        }
      }

      // 检查API密钥
      if (!getApiKeyFromStorage) {
        throw new Error('getApiKeyFromStorage 未提供');
      }

      const apiKey = await getApiKeyFromStorage();
      if (!apiKey || apiKey.trim() === '') {
        if (currentPanelPort) {
          try {
            currentPanelPort.postMessage({
              type: 'ERROR',
              error: 'API 密钥未配置，请在设置中配置豆包 AI API 密钥',
              requestId: requestId,
            });
          } catch (error) {
            console.error('发送 API 密钥错误失败: ', error);
          }
        }
        return;
      }

      // 设置当前AI进程（用于中断）
      this.currentAIProcess = {
        abort: () => this.terminate(),
      };

      await this.sendMessageWithStream(question, domData, cssData, {
        // 处理每个数据块
        onChunk: (chunk: string, isFirst: boolean) => {
          if (currentPanelPort) {
            try {
              currentPanelPort.postMessage({
                type: 'STREAMING_CONTENT',
                content: chunk,
                isFirstChunk: isFirst,
                requestId: requestId,
              });
            } catch (error) {
              console.error('发送流式内容失败: ', error);
              currentPanelPort = null;
            }
          }
        },
        // 完成回调
        onComplete: () => {
          if (currentPanelPort) {
            try {
              currentPanelPort.postMessage({
                type: 'STREAMING_COMPLETE',
                requestId: requestId,
              });

              // 触发生成反馈选项
              this.generateFeedbackOptions(
                question,
                currentPanelPort,
                requestId
              );
            } catch (error) {
              console.error('发送完成消息失败: ', error);
            }
          }
        },
        // 错误处理
        onError: (error: Error) => {
          if (currentPanelPort) {
            try {
              currentPanelPort.postMessage({
                type: 'ERROR',
                error: 'AI 生成失败: ' + error.message,
                requestId: requestId,
              });
            } catch (sendError) {
              console.error('发送错误消息失败: ', sendError);
            }
            currentPanelPort = null;
          }
        },
      });
    } catch (error) {
      console.error('处理问题时出错: ', error);

      if (currentPanelPort) {
        try {
          currentPanelPort.postMessage({
            type: 'ERROR',
            error: '处理问题失败: ' + (error as Error).message,
            requestId: requestId,
          });
        } catch (sendError) {
          console.error('发送错误消息失败: ', sendError);
        }
        currentPanelPort = null;
      }

      sendResponse({
        success: false,
        error:
          error instanceof Error ? error.message : '处理问题时出现未知错误',
      });
    }
  }

  /**
   * 终止所有AI相关任务
   * @param options - 终止选项
   */
  public terminateTasks(options: TerminateOptions): void {
    console.log('终止所有相关任务');

    // 中断当前AI进程
    if (this.currentAIProcess) {
      try {
        this.currentAIProcess.abort();
      } catch (error) {
        console.error('终止AI进程失败: ', error);
      }
      this.currentAIProcess = null;
    }

    // 清理资源
    this.cleanup();

    // 根据不同的响应方式返回结果
    if (options.responseMethod === 'sendResponse' && options.sendResponse) {
      options.sendResponse({
        type: 'terminated',
        message: '所有任务已终止',
        status: 'success',
      });
    } else if (options.responseMethod === 'portMessage' && options.port) {
      try {
        options.port.postMessage({
          type: 'TASK_TERMINATED',
          message: 'AI任务已终止',
          requestId: options.requestId,
        });
      } catch (error) {
        console.error('发送终止任务消息失败: ', error);
      }
    }
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * 生成反馈选项
   * @param prompt - 原始提示词
   * @param panelPort - 长连接端口
   * @param requestId - 请求ID
   */
  private async generateFeedbackOptions(
    prompt: string,
    panelPort: chrome.runtime.Port,
    requestId: string
  ): Promise<void> {
    try {
      const feedbackPrompt = `
根据用户的问题和AI的回答，生成三个可能的进一步操作选项，用于用户交互。

原始问题和回答上下文：
${prompt}

请生成三个简洁、具体的选项，每个选项应该是一个完整的问题或请求，用户可以直接点击使用。

选项要求：
1. 每个选项长度不超过50个字符
2. 选项应该与上下文相关，提供有意义的下一步操作
3. 选项应该多样化，涵盖不同的可能需求
4. 选项应该以用户的语气表达

请返回一个JSON数组，格式如下：
{
  "options": [
    { "id": "option_1", "text": "选项1文本" },
    { "id": "option_2", "text": "选项2文本" },
    { "id": "option_3", "text": "选项3文本" }
  ]
}

只返回JSON，不要其他内容。`;

      // 收集AI生成的完整响应
      let fullResponse = '';

      // 使用aiService生成反馈选项
      await this.sendMessageWithStream(feedbackPrompt, undefined, undefined, {
        // 收集每个数据块
        onChunk: (chunk: string, _isFirst: boolean) => {
          fullResponse += chunk;
        },
        // 响应完成后处理结果
        onComplete: () => {
          try {
            // 解析AI生成的JSON响应
            let feedbackOptions = [];
            try {
              const parsedResponse = JSON.parse(fullResponse);
              feedbackOptions = parsedResponse.options || [];
            } catch (parseError) {
              console.error('解析反馈选项失败，使用默认选项: ', parseError);
              // 如果解析失败，使用默认选项
              feedbackOptions = [
                {
                  id: `option_${Date.now()}_1`,
                  text: '帮我优化这个页面的性能',
                },
                {
                  id: `option_${Date.now()}_2`,
                  text: '分析这个组件的CSS样式',
                },
                {
                  id: `option_${Date.now()}_3`,
                  text: '解释这个功能的实现原理',
                },
              ];
            }

            // 为每个选项生成唯一ID
            const optionsWithIds = feedbackOptions.map(
              (option: any, index: number) => ({
                id: `option_${requestId}_${index + 1}`,
                text: option.text || option.content || `选项${index + 1}`,
              })
            );

            // 发送生成的反馈选项
            panelPort.postMessage({
              type: 'FEEDBACK_OPTIONS_GENERATED',
              requestId: requestId,
              options: optionsWithIds,
            });
          } catch (error) {
            console.error('处理反馈选项失败: ', error);
            // 发送错误通知
            panelPort.postMessage({
              type: 'FEEDBACK_OPTIONS_ERROR',
              requestId: requestId,
              error: '生成反馈选项失败',
            });
          }
        },
        // 错误处理
        onError: (error: Error) => {
          console.error('生成反馈选项时AI调用失败: ', error);
          // 发送错误通知
          panelPort.postMessage({
            type: 'FEEDBACK_OPTIONS_ERROR',
            requestId: requestId,
            error: '生成反馈选项失败',
          });
        },
      });
    } catch (error) {
      console.error('生成反馈选项失败: ', error);
      // 发送错误通知
      panelPort.postMessage({
        type: 'FEEDBACK_OPTIONS_ERROR',
        requestId: requestId,
        error: '生成反馈选项失败',
      });
    }
  }

  /**
   * 终止当前 AI 请求
   */
  public terminate(): void {
    this.cleanup();
  }
}
