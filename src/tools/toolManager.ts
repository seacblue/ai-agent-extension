import { Tool, ToolRegistry, ToolResult, ToolContext } from './types';

// 缓存项接口定义
interface CacheItem {
  result: ToolResult;
  timestamp: number;
  params: any;
  context?: ToolContext;
}

// 缓存配置接口
interface CacheConfig {
  enabled: boolean;
  maxAge: number; // 毫秒
  maxItems: number;
}

export class ToolManager implements ToolRegistry {
  public tools: Map<string, Tool> = new Map();
  private cache: Map<string, CacheItem> = new Map();
  private cacheConfig: CacheConfig = {
    enabled: true,
    maxAge: 30000, // 默认缓存 30 秒
    maxItems: 100, // 最多缓存 100 个结果
  };

  // 设置缓存配置
  setCacheConfig(config: Partial<CacheConfig>): void {
    this.cacheConfig = { ...this.cacheConfig, ...config };
  }

  // 生成缓存键
  private generateCacheKey(
    toolName: string,
    params: any,
    context?: ToolContext
  ): string {
    const paramsStr = JSON.stringify(params || {});
    const contextStr = JSON.stringify(context || {});
    return `${toolName}:${paramsStr}:${contextStr}`;
  }

  // 获取缓存项
  private getCacheItem(
    toolName: string,
    params: any,
    context?: ToolContext
  ): ToolResult | null {
    if (!this.cacheConfig.enabled) return null;

    const key = this.generateCacheKey(toolName, params, context);
    const item = this.cache.get(key);

    if (!item) return null;

    // 检查缓存是否过期
    const now = Date.now();
    if (now - item.timestamp > this.cacheConfig.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return item.result;
  }

  // 设置缓存项
  private setCacheItem(
    toolName: string,
    params: any,
    result: ToolResult,
    context?: ToolContext
  ): void {
    if (!this.cacheConfig.enabled) return;

    // 检查缓存是否已满
    if (this.cache.size >= this.cacheConfig.maxItems) {
      // 删除最旧的缓存项
      let oldestKey = null;
      let oldestTime = Date.now();

      for (const [key, item] of this.cache) {
        if (item.timestamp < oldestTime) {
          oldestTime = item.timestamp;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const key = this.generateCacheKey(toolName, params, context);
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      params,
      context,
    });
  }

  // 清除缓存
  clearCache(toolName?: string): void {
    if (toolName) {
      // 清除特定工具的缓存
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${toolName}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      // 清除所有缓存
      this.cache.clear();
    }
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    console.log(`工具已注册: ${tool.name}`);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  findToolsByKeywords(keywords: string[]): Tool[] {
    const matchedTools: Tool[] = [];

    for (const tool of this.tools.values()) {
      const hasKeywordMatch = keywords.some(keyword =>
        tool.keywords.some(
          toolKeyword =>
            toolKeyword.toLowerCase().includes(keyword.toLowerCase()) ||
            keyword.toLowerCase().includes(toolKeyword.toLowerCase())
        )
      );

      if (hasKeywordMatch) {
        matchedTools.push(tool);
      }
    }

    return matchedTools;
  }

  listAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  async executeTool(
    toolName: string,
    params?: any,
    context?: ToolContext
  ): Promise<ToolResult> {
    const tool = this.getTool(toolName);
    if (!tool) {
      return {
        success: false,
        error: `工具 "${toolName}" 未找到`,
        toolName,
        executionTime: 0,
      };
    }

    // 尝试从缓存获取结果
    const cachedResult = this.getCacheItem(toolName, params, context);
    if (cachedResult) {
      console.log(`从缓存获取工具 "${toolName}" 的结果`);
      return cachedResult;
    }

    const startTime = Date.now();

    try {
      const result = await tool.execute(params, context);
      result.executionTime = Date.now() - startTime;

      // 将结果存入缓存
      this.setCacheItem(toolName, params, result, context);

      return result;
    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        toolName,
        executionTime: Date.now() - startTime,
      };

      // 错误结果不缓存
      return errorResult;
    }
  }

  // 根据用户问题智能选择并执行工具
  async executeToolsByKeywords(
    keywords: string[],
    params?: any,
    context?: ToolContext
  ): Promise<ToolResult[]> {
    const matchedTools = this.findToolsByKeywords(keywords);

    if (matchedTools.length === 0) {
      return [
        {
          success: false,
          error: '未找到匹配的工具',
          toolName: 'none',
          executionTime: 0,
        },
      ];
    }

    const results: ToolResult[] = [];

    for (const tool of matchedTools) {
      const result = await this.executeTool(tool.name, params, context);
      results.push(result);
    }

    return results;
  }
}

// 创建全局工具管理器实例
export const ToolManagerImpl = new ToolManager();
