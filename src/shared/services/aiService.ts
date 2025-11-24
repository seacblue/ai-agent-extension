// AI 服务封装
import { DoubaoAIClient, ChatMessage } from './aiClient';
import { getApiKeyFromStorage } from './api';

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
 * AI 服务类，封装所有 AI 相关功能
 */
export class AIService {
  private aiClient: DoubaoAIClient | null = null;
  private abortController: AbortController | null = null;
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
      const key = apiKey || await getApiKeyFromStorage();
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
          content: '你是一个专业的分析助手，擅长判断用户问题的分析需求。只返回 JSON 格式的结果。'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ];

      const response = await this.aiClient.sendMessage(messages);
      console.log('AI 分析响应:', JSON.stringify(response, null, 2));
      
      try {
        const content = response.choices?.[0]?.message?.content || '';
        const result = JSON.parse(content);
        
        return {
          shouldAnalyzeDOM: Boolean(result.shouldAnalyzeDOM),
          shouldAnalyzeCSS: Boolean(result.shouldAnalyzeCSS),
          targetElement: result.targetElement || undefined
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

      // 构建提示词
      const promptParts = [
        '你是一个专业的AI开发者助手，擅长分析网页结构和回答技术问题。'
      ];

      if (domData) {
        promptParts.push(`DOM分析数据：\n${domData}`);
      }

      if (cssData) {
        promptParts.push(`CSS分析数据：\n${cssData}`);
      }

      promptParts.push(`用户问题：${question}`);
      promptParts.push('请基于以上提供的分析数据（如果有）来回答用户的问题。如果没有相关数据，请直接回答用户的问题。');
      
      let fullPrompt = promptParts.join('\n\n');
      
      // 检查提示词长度
      if (fullPrompt.length > 20000) {
        console.log(`警告：整体提示词长度 ${fullPrompt.length} 字符，可能接近 token 限制`);
        // 如果提示词太长，可以进一步精简
        if (fullPrompt.length > 30000) {
          fullPrompt = fullPrompt.substring(0, 30000) + '...\n[提示词已被截断以避免token超限]';
        }
      }

      let isFirstChunk = true;

      // 发送流式消息
      await this.aiClient.sendMessageStream(
        [
          {
            role: 'system',
            content: '你是一个专业的网页分析和开发助手，专门帮助用户完成网页相关的任务。你需要分析页面结构、CSS样式、DOM元素等，并提供解决方案。请始终使用中文回答用户的问题。无论用户使用什么语言提问，都要用中文回复。'
          },
          {
            role: 'user',
            content: fullPrompt
          }
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
          if (options.onComplete) {
            options.onComplete();
          }
        },
        // onError - 错误处理
        (error: Error) => {
          this.abortController = null;
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
      console.error('AI 调用过程中出错: ', error);
      if (options.onError) {
        options.onError(error as Error);
      }
    }
  }

  /**
   * 截断数据以避免 token 超限
   * @param data - 要截断的数据
   * @param maxLength - 最大长度
   * @returns 截断后的数据
   */
  public truncateData(data: any, maxLength: number = 10000): string {
    try {
      let jsonString = JSON.stringify(data, null, 2);
      if (jsonString.length > maxLength) {
        console.log(`数据被截断，原始长度: ${jsonString.length}，截断后长度: ${maxLength}`);
        return jsonString.substring(0, maxLength - 100) + '... [数据被截断以避免token超限]';
      }
      return jsonString;
    } catch (e) {
      console.error('数据序列化失败:', e);
      return '[数据序列化失败]';
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
   * 终止当前 AI 请求
   */
  public terminate(): void {
    this.cleanup();
  }
}
