// 豆包 AI API 客户端
import { API_CONFIG } from './api';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
    };
  }>;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class DoubaoAIClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = API_CONFIG.VOLCES.API_URL;
    this.model = API_CONFIG.VOLCES.MODEL;
  }

  // 发送聊天请求
  async sendMessage(messages: ChatMessage[]): Promise<ChatCompletionResponse> {
    const request: ChatCompletionRequest = {
      model: this.model,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data: ChatCompletionResponse = await response.json();
      return data;
    } catch (error) {
      console.error('豆包 AI API 调用失败:', error);
      throw error;
    }
  }

  // 流式发送聊天请求
  async sendMessageStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const request: ChatCompletionRequest = {
      model: this.model,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      stream: true,
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(request),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        // 检查是否被中断
        if (abortSignal?.aborted) {
          throw new Error('请求被用户中断');
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          // 检查是否被中断
          if (abortSignal?.aborted) {
            throw new Error('请求被用户中断');
          }

          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              onComplete();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch (e) {
              console.warn('解析流式响应失败: ', e);
            }
          }
        }
      }

      onComplete();
    } catch (error) {
      if (abortSignal?.aborted) {
        console.log('AI 流式请求被中断');
        onError(new Error('请求被用户中断'));
      } else {
        console.error('豆包 AI 流式 API 调用失败: ', error);
        onError(error as Error);
      }
    }
  }
}