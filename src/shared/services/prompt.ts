// 提示词处理工具类

/**
 * 提示词构建器配置接口
 */
export interface PromptBuilderConfig {
  domData?: string;
  cssData?: string;
  question: string;
  maxLength?: number;
}

/**
 * 提示词处理工具类，提供提示词构建、验证和截断功能
 */
export class PromptUtils {
  /**
   * 构建完整的提示词
   * @param config - 提示词构建配置
   * @returns 构建好的提示词
   */
  static buildPrompt(config: PromptBuilderConfig): string {
    const { domData, cssData, question, maxLength = 30000 } = config;

    // 构建提示词部分
    const promptParts = [
      '你是一个专业的AI开发者助手，擅长分析网页结构和回答技术问题。',
    ];

    if (domData) {
      promptParts.push(`DOM分析数据：\n${domData}`);
    }

    if (cssData) {
      promptParts.push(`CSS分析数据：\n${cssData}`);
    }

    promptParts.push(`用户问题：${question}`);
    promptParts.push(
      '请基于以上提供的分析数据（如果有）来回答用户的问题。如果没有相关数据，请直接回答用户的问题。'
    );

    // 组合完整的提示词
    let fullPrompt = promptParts.join('\n\n');

    // 检查提示词长度并截断
    return PromptUtils.truncatePrompt(fullPrompt, maxLength);
  }

  /**
   * 截断提示词，避免token超限
   * @param prompt - 要截断的提示词
   * @param maxLength - 最大长度，默认30000字符
   * @returns 截断后的提示词
   */
  static truncatePrompt(prompt: string, maxLength: number = 30000): string {
    // 提示词长度检查和截断
    if (prompt.length > 20000) {
      console.log(
        `警告：整体提示词长度 ${prompt.length} 字符，可能接近 token 限制`
      );

      // 如果提示词太长，进一步精简或只保留最相关部分
      if (prompt.length > maxLength) {
        return (
          prompt.substring(0, maxLength) +
          '...\n[提示词已被截断以避免token超限]'
        );
      }
    }

    return prompt;
  }

  /**
   * 截断数据，避免token超限
   * @param data - 要截断的数据
   * @param maxLength - 最大长度，默认10000字符
   * @returns 截断后的数据
   */
  static truncateData(data: any, maxLength: number = 10000): string {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      if (jsonString.length > maxLength) {
        console.log(
          `数据被截断，原始长度: ${jsonString.length}，截断后长度: ${maxLength}`
        );
        return (
          jsonString.substring(0, maxLength - 100) +
          '... [数据被截断以避免token超限]'
        );
      }
      return jsonString;
    } catch (e) {
      console.error('数据序列化失败:', e);
      return '[数据序列化失败]';
    }
  }
}
