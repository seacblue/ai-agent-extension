// AI处理服务，封装AI进程管理和任务处理功能
import { AIService } from './aiService';

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
 * 问题处理选项接口
 */
export interface QuestionOptions {
  question: string;
  requestId: string;
  sender: chrome.runtime.MessageSender;
  sendResponse: (response: any) => void;
  panelPorts?: Map<string, chrome.runtime.Port>;
  getApiKeyFromStorage?: () => Promise<string>;
  LongConnectionManager?: any;
}

/**
 * Analysis决策接口
 */
export interface AnalysisDecision {
  shouldAnalyzeDOM: boolean;
  shouldAnalyzeCSS: boolean;
  targetElement?: string;
}

/**
 * AI进程服务类，管理AI相关进程和任务
 */
export class AIProcessService {
  private static instance: AIProcessService;
  private currentAIProcess: { abort: () => void } | null = null;
  private aiService: AIService;

  /**
   * 获取AI进程服务单例实例
   */
  public static getInstance(): AIProcessService {
    if (!AIProcessService.instance) {
      AIProcessService.instance = new AIProcessService();
    }
    return AIProcessService.instance;
  }

  /**
   * 构造函数，初始化服务
   */
  private constructor() {
    this.aiService = AIService.getInstance();
  }

  /**
   * 设置当前AI进程
   * @param process - AI进程对象
   */
  public setCurrentProcess(process: { abort: () => void } | null): void {
    this.currentAIProcess = process;
  }

  /**
   * 获取当前AI进程
   * @returns 当前AI进程对象或null
   */
  public getCurrentProcess(): { abort: () => void } | null {
    return this.currentAIProcess;
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

    // 根据不同的响应方式返回结果
    if (options.responseMethod === 'sendResponse' && options.sendResponse) {
      options.sendResponse({
        type: 'terminated',
        message: '所有任务已终止',
        status: 'success'
      });
    } else if (options.responseMethod === 'portMessage' && options.port) {
      try {
        options.port.postMessage({
          type: 'TASK_TERMINATED',
          message: 'AI任务已终止',
          requestId: options.requestId
        });
      } catch (error) {
        console.error('发送终止任务消息失败: ', error);
      }
    }
  }

  /**
   * 数据截断函数
   * @param data - 要截断的数据
   * @param maxLength - 最大长度
   * @returns 截断后的数据
   */
  private truncateData(data: any, maxLength: number = 10000): string {
    try {
      let jsonString = JSON.stringify(data, null, 2);
      if (jsonString.length > maxLength) {
        console.log(`数据被截断，原始长度: ${jsonString.length}，截断后长度: ${maxLength}`);
        // 保留数据的主要结构
        return jsonString.substring(0, maxLength - 100) + '... [数据被截断以避免token超限]';
      }
      return jsonString;
    } catch (e) {
      console.error('数据序列化失败:', e);
      return '[数据序列化失败]';
    }
  }

  /**
   * 处理用户问题
   * @param options - 问题处理选项
   */
  public async handleQuestion(options: QuestionOptions): Promise<void> {
    let panelPort: chrome.runtime.Port | null = null;
    const { question, requestId, sender, sendResponse, panelPorts, getApiKeyFromStorage, LongConnectionManager } = options;
    
    try {
      // 检查是否已经有 Panel 连接
      if (panelPorts && panelPorts.size > 0) {
        // 使用现有的 Panel 连接
        const portValue = panelPorts.values().next().value;
        panelPort = portValue !== undefined ? portValue : null;
        console.log('使用现有的 Panel 连接');
        
        // 发送连接确认
        try {
          // 在发送消息前检查 port 是否有效
          if (panelPort && panelPort.sender) {
            const portId = panelPorts.keys().next().value;
            panelPort.postMessage({
              type: 'CONNECTION_ACK',
              portId: portId,
              timestamp: new Date().toISOString()
            });
            console.log('发送连接确认成功: ', portId);
          } else {
            console.warn('连接已断开或无效，无法发送确认');
            panelPort = null;
            // 从 panelPorts 中移除断开的连接
            const portId = panelPorts.keys().next().value;
            if (portId) {
              panelPorts.delete(portId);
            }
          }
        } catch (error) {
          console.error('发送连接确认失败: ', error);
          panelPort = null;
          // 从 panelPorts 中移除断开的连接
          const portId = panelPorts.keys().next().value;
          if (portId) {
            panelPorts.delete(portId);
          }
        }
      } else {
        // 建立与 Panel 的长连接用于发送多个响应
        panelPort = chrome.runtime.connect({ name: 'question-response' });
        
        // 设置连接超时
        const connectionTimeout = setTimeout(() => {
          if (panelPort) {
            console.warn('Panel 连接超时，断开连接');
            panelPort = null;
          }
        }, 5000);
        
        // 等待 Panel 的连接确认
        const connectionAckPromise = new Promise<void>((resolve, reject) => {
          let ackReceived = false;
          
          if (panelPort) {
            panelPort.onMessage.addListener((message: any) => {
              if (message.type === 'CONNECTION_ACK') {
                ackReceived = true;
                console.log('收到 Panel 连接确认: ', message.portId);
                clearTimeout(connectionTimeout);
                resolve();
              }
            });
            
            panelPort.onDisconnect.addListener(() => {
              clearTimeout(connectionTimeout);
              if (!ackReceived) {
                if (chrome.runtime.lastError) {
                  console.error('Panel 连接断开: ', chrome.runtime.lastError.message);
                }
                reject(new Error('Panel 连接断开，未收到确认'));
              }
            });
          } else {
            clearTimeout(connectionTimeout);
            reject(new Error('Panel 连接无效'));
          }
        });
        
        // 等待连接确认或超时
        await connectionAckPromise;
        console.log('Background 与 Panel 长连接建立成功');
        
        // 重新设置断开监听器
        if (panelPort) {
          panelPort.onDisconnect.addListener(() => {
            console.log('Panel 连接已断开');
            panelPort = null;
          });
        }
      }

      // 分析问题需求
      const analysisDecision = await this.analyzeQuestionRequirements(question, panelPort);

      // 获取标签页信息
      let tabId = (sender as any).tabId || sender.tab?.id;
      if (!tabId) {
        const tabs = await chrome.tabs.query({});
        const activeTab = tabs.find(tab => tab.active) || tabs[0];
        tabId = activeTab?.id;
      }
      
      if (!tabId) {
        if (panelPort) {
          try {
            panelPort.postMessage({
              type: 'ERROR',
              error: '无法获取当前标签页信息，请确保在网页上打开 DevTools',
              requestId: requestId
            });
          } catch (error) {
            console.error('发送标签页错误失败: ', error);
          }
        }
        return;
      }

      // 构建 Prompt
      let promptParts = ['你是一个专业的AI开发者助手，擅长分析网页结构和回答技术问题。'];

      // DOM分析
      if (analysisDecision.shouldAnalyzeDOM && LongConnectionManager && panelPort) {
        try {
          if (panelPort) {
            panelPort.postMessage({
              type: 'THINKING',
              content: '正在使用 DOM 分析工具...',
              requestId: requestId
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
                  maxDepth: 5
                },
                htmlOptions: {
                  format: true,
                  includeDoctype: false
                }
              },
              context: {
                tabId,
                question,
                timestamp: new Date().toISOString()
              }
            },
            'dom-analysis-result',
            15000
          );
          
          console.log('DOM 分析完成');
          
          if (domResult.success && domResult.results && domResult.results.length > 0) {
            const truncatedDomData = this.truncateData(domResult.results[0].data, 8000);
            promptParts.push(`DOM 分析数据：\n${truncatedDomData}`);
          } else {
            console.warn('DOM 分析未返回有效结果');
          }
        } catch (error) {
          console.error('DOM 分析失败:', error);
        }
      }

      // CSS分析
      if (analysisDecision.shouldAnalyzeCSS && LongConnectionManager && panelPort) {
        try {
          if (panelPort) {
            panelPort.postMessage({
              type: 'THINKING',
              content: '正在使用 CSS 分析工具...',
              requestId: requestId
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
                includeAll: false
              },
              context: {
                tabId,
                question,
                timestamp: new Date().toISOString()
              }
            },
            'css-analysis-result',
            15000
          );
          
          console.log('CSS 分析完成');
          
          if (cssResult.success && cssResult.results && cssResult.results.length > 0) {
            const truncatedCssData = this.truncateData(cssResult.results[0].data, 5000);
            promptParts.push(`CSS 分析数据：\n${truncatedCssData}`);
          } else {
            console.warn('CSS 分析未返回有效结果');
          }
        } catch (error) {
          console.error('CSS 分析失败:', error);
        }
      }

      // 添加用户问题到 Prompt
      promptParts.push(`用户问题：${question}`);
      promptParts.push('请基于以上提供的分析数据（如果有）来回答用户的问题。如果没有相关数据，请直接回答用户的问题。');
      
      // 组合完整的 Prompt
      let finalPrompt = promptParts.join('\n\n');
      
      // 提示词长度检查和截断
      if (finalPrompt.length > 20000) {
        console.log(`警告：整体提示词长度 ${finalPrompt.length} 字符，可能接近 token 限制`);
        // 如果提示词太长，可以进一步精简或只保留最相关部分
        if (finalPrompt.length > 30000) {
          finalPrompt = finalPrompt.substring(0, 30000) + '...\n[提示词已被截断以避免token超限]';
        }
      }

      // 检查API密钥
      if (!getApiKeyFromStorage) {
        throw new Error('getApiKeyFromStorage 未提供');
      }
      
      const apiKey = await getApiKeyFromStorage();
      if (!apiKey || apiKey.trim() === '') {
        if (panelPort) {
          try {
            panelPort.postMessage({
              type: 'ERROR',
              error: 'API 密钥未配置，请在设置中配置豆包 AI API 密钥',
              requestId: requestId
            });
          } catch (error) {
            console.error('发送 API 密钥错误失败: ', error);
          }
        }
        return;
      }
      
      // 设置当前AI进程（用于中断）
      this.currentAIProcess = {
        abort: () => this.aiService.terminate()
      };
      
      // 使用AIService发送消息
      await this.aiService.sendMessageWithStream(
        finalPrompt,
        undefined,
        undefined,
        {
          // 处理每个数据块
          onChunk: (chunk: string, isFirst: boolean) => {
            if (panelPort) {
              try {
                panelPort.postMessage({
                  type: 'STREAMING_CONTENT',
                  content: chunk,
                  isFirstChunk: isFirst,
                  requestId: requestId
                });
              } catch (error) {
                console.error('发送流式内容失败: ', error);
                panelPort = null;
              }
            }
          },
          // 完成回调
          onComplete: () => {
            this.currentAIProcess = null;
            if (panelPort) {
              try {
                panelPort.postMessage({
                  type: 'STREAMING_COMPLETE',
                  requestId: requestId
                });
              } catch (error) {
                console.error('发送完成消息失败: ', error);
              }
              panelPort = null;
            }
          },
          // 错误处理
          onError: (error: Error) => {
            this.currentAIProcess = null;
            console.error('AI 调用失败: ', error);
            if (panelPort) {
              try {
                panelPort.postMessage({
                  type: 'ERROR',
                  error: 'AI 生成失败: ' + error.message,
                  requestId: requestId
                });
              } catch (sendError) {
                console.error('发送错误消息失败: ', sendError);
              }
              panelPort = null;
            }
          }
        }
      );
    } catch (error) {
      console.error('处理问题时出错: ', error);
      
      if (panelPort) {
        try {
          panelPort.postMessage({
            type: 'ERROR',
            error: '处理问题失败: ' + (error as Error).message,
            requestId: requestId
          });
        } catch (sendError) {
          console.error('发送错误消息失败: ', sendError);
        }
        panelPort = null;
      }
      
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : '处理问题时出现未知错误'
      });
    }
  }

  /**
   * 分析问题需求
   * @param question - 用户问题
   * @param panelPort - Panel端口
   * @returns 分析决策结果
   */
  private async analyzeQuestionRequirements(question: string, panelPort?: chrome.runtime.Port | null): Promise<AnalysisDecision> {
    try {
      // 使用AIService的analyzeQuestionRequirements方法
      const result = await this.aiService.analyzeQuestionRequirements(
        question,
        (errorMessage: string) => {
          if (panelPort) {
            try {
              panelPort.postMessage({
                type: 'ERROR',
                error: errorMessage
              });
            } catch (error) {
              console.error('发送分析错误失败: ', error);
            }
          }
        }
      );
      
      return result;
    } catch (error) {
      console.error('分析问题需求失败: ', error);
      // 返回默认决策
      return {
        shouldAnalyzeDOM: false,
        shouldAnalyzeCSS: false
      };
    }
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    this.terminateTasks({ responseMethod: 'sendResponse' });
  }
}
