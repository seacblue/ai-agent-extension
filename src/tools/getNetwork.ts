import { Tool, ToolResult } from './types';

// getNetwork 工具选项接口
interface GetNetworkOptions {
  filter?: {
    url?: string;
    method?: string;
    statusCode?: number;
    resourceType?: string;
  };
  includeContent?: boolean;
  startTime?: number;
  endTime?: number;
}

// HAR 响应内容接口
interface HarContent {
  size: number;
  mimeType: string;
  text?: string;
  encoding?: string;
}

// HAR 响应接口
interface HarResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  headers: Array<{ name: string; value: string }>;
  cookies: Array<{ name: string; value: string }>;
  content: HarContent;
  redirectURL: string;
  headersSize: number;
  bodySize: number;
}

// HAR 请求接口
interface HarRequest {
  method: string;
  url: string;
  httpVersion: string;
  headers: Array<{ name: string; value: string }>;
  cookies: Array<{ name: string; value: string }>;
  queryString: Array<{ name: string; value: string }>;
  headersSize: number;
  bodySize: number;
  postData?: {
    mimeType: string;
    text: string;
  };
}

// HAR 条目接口
interface HarEntry {
  pageref?: string;
  startedDateTime: string;
  time: number;
  request: HarRequest;
  response: HarResponse;
  cache: Record<string, any>;
  timings: {
    block: number;
    dns: number;
    connect: number;
    send: number;
    wait: number;
    receive: number;
    ssl?: number;
  };
  serverIPAddress?: string;
  connection?: string;
  _initiator?: {
    type: string;
    url?: string;
    lineNumber?: number;
  };
  _resourceType?: string;
}

// HAR 页面接口
interface HarPage {
  startedDateTime: string;
  id: string;
  title: string;
  pageTimings: Record<string, any>;
  comment?: string;
}

// HAR 日志接口
interface HarLog {
  version: string;
  creator: {
    name: string;
    version: string;
  };
  browser?: {
    name: string;
    version: string;
  };
  pages: HarPage[];
  entries: HarEntry[];
  comment?: string;
}

// HAR 结果接口
interface HarResult {
  log: HarLog;
}

// getNetwork 结果接口
interface GetNetworkResult {
  success: boolean;
  pageInfo: {
    title: string;
    url: string;
    timestamp: string;
  };
  har: HarResult;
  filteredEntriesCount: number;
  totalEntriesCount: number;
  error?: string;
}

class NetworkToolImpl implements Tool {
  name = 'getNetwork';
  description = '网络请求分析工具，获取页面的网络请求日志（HAR 格式）';
  keywords = ['network', 'HAR', '网络请求', '请求日志', '网络分析'];

  async execute(params: GetNetworkOptions = {}): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // 检查是否在 DevTools 上下文中
      if (
        typeof chrome !== 'undefined' &&
        chrome.devtools &&
        chrome.devtools.network
      ) {
        console.log(
          '网络工具：在 DevTools 上下文中执行，直接调用 getHAR() API'
        );
        // 在 DevTools 上下文中直接调用 getHAR()
        const har = await this.getHARFromDevTools();
        const result = this.processHAR(har, params);

        return {
          success: true,
          data: result,
          toolName: this.name,
          executionTime: Date.now() - startTime,
        };
      } else {
        const har = await this.getHARFromBackground();
        if (har.success) {
          if (!har.har) {
            return {
              success: false,
              error: '获取 HAR 数据失败：har 为 undefined',
              toolName: this.name,
              executionTime: Date.now() - startTime,
            };
          }
          const result = this.processHAR(har.har, params);
          return {
            success: true,
            data: result,
            toolName: this.name,
            executionTime: Date.now() - startTime,
          };
        } else {
          return {
            success: false,
            error: har.error || '获取 HAR 数据失败',
            toolName: this.name,
            executionTime: Date.now() - startTime,
          };
        }
      }
    } catch (error) {
      console.error('网络工具执行失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        toolName: this.name,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 从 DevTools 直接获取 HAR
   */
  private getHARFromDevTools(): Promise<HarResult> {
    return new Promise((resolve, reject) => {
      try {
        // Chrome DevTools API 返回的是 log 对象，需要处理类型差异
        chrome.devtools.network.getHAR(harLog => {
          if (harLog) {
            console.log('DevTools 原始 HAR 数据: ', harLog);

            // 转换 entries，确保符合我们定义的 HarEntry 类型
            const processedEntries: HarEntry[] = (harLog.entries || []).map(
              entry => {
                // 转换 postData，确保符合我们的类型定义
                const processedPostData = entry.request.postData
                  ? {
                      mimeType: entry.request.postData.mimeType || '',
                      text: entry.request.postData.text || '',
                    }
                  : undefined;

                return {
                  ...entry,
                  request: {
                    ...entry.request,
                    postData: processedPostData,
                  },
                } as unknown as HarEntry;
              }
            );

            // 确保所有必填属性都存在
            const processedHarLog: HarLog = {
              version: harLog.version || '1.2',
              creator: harLog.creator || {
                name: 'Chrome DevTools',
                version: '',
              },
              browser: harLog.browser,
              pages: harLog.pages || [],
              entries: processedEntries,
              comment: harLog.comment,
            };

            const harResult: HarResult = { log: processedHarLog };
            console.log('处理后的 HAR 数据: ', harResult);
            resolve(harResult);
          } else {
            reject(new Error('无法获取 HAR 数据: getHAR() 返回 null'));
          }
        });
      } catch (error) {
        reject(
          new Error(
            '调用 chrome.devtools.network.getHAR() 失败: ' +
              (error instanceof Error ? error.message : String(error))
          )
        );
      }
    });
  }

  /**
   * 从 Background 获取 HAR 数据
   */
  private async getHARFromBackground(): Promise<{
    success: boolean;
    har?: HarResult;
    error?: string;
  }> {
    return new Promise(resolve => {
      try {
        // 检查 chrome.runtime 是否可用
        if (typeof chrome === 'undefined' || !chrome.runtime) {
          resolve({
            success: false,
            error: 'chrome.runtime 不可用，无法获取 HAR 数据',
          });
          return;
        }

        // 发送消息到 Background
        chrome.runtime.sendMessage({ type: 'GET_HAR_DATA' }, response => {
          console.log('网络工具：收到 Background 返回的 HAR 数据:', response);
          if (chrome.runtime.lastError) {
            console.error(
              '网络工具：获取 HAR 数据时发生错误:',
              chrome.runtime.lastError
            );
            resolve({
              success: false,
              error: `获取 HAR 数据失败: ${chrome.runtime.lastError.message}`,
            });
          } else if (response && response.success) {
            // 验证返回的数据结构
            if (response.har && response.har.log) {
              // 确保 entries 是数组
              if (!Array.isArray(response.har.log.entries)) {
                response.har.log.entries = [];
              }
              resolve({ success: true, har: response.har });
            } else {
              resolve({ success: false, error: 'HAR 数据格式无效' });
            }
          } else {
            resolve({
              success: false,
              error: response?.error || '获取 HAR 数据失败，未知错误',
            });
          }
        });
      } catch (error) {
        console.error('网络工具：调用 chrome.runtime.sendMessage 失败:', error);
        resolve({
          success: false,
          error: `调用 chrome.runtime.sendMessage 失败: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    });
  }

  /**
   * 处理 HAR 数据，根据过滤条件筛选条目
   */
  private processHAR(
    har: HarResult,
    params: GetNetworkOptions
  ): GetNetworkResult {
    const entries = har.log.entries;
    const totalEntriesCount = entries.length;
    let filteredEntries = [...entries];

    // 应用过滤条件
    if (params.filter) {
      filteredEntries = filteredEntries.filter(entry => {
        // URL 过滤
        if (
          params.filter?.url &&
          !entry.request.url.includes(params.filter.url)
        ) {
          return false;
        }

        // 方法过滤
        if (
          params.filter?.method &&
          entry.request.method !== params.filter.method
        ) {
          return false;
        }

        // 状态码过滤
        if (
          params.filter?.statusCode &&
          entry.response.status !== params.filter.statusCode
        ) {
          return false;
        }

        // 资源类型过滤
        if (
          params.filter?.resourceType &&
          entry._resourceType !== params.filter.resourceType
        ) {
          return false;
        }

        return true;
      });
    }

    // 时间范围过滤
    if (params.startTime && params.endTime) {
      filteredEntries = filteredEntries.filter(entry => {
        const entryTime = new Date(entry.startedDateTime).getTime();
        return entryTime >= params.startTime! && entryTime <= params.endTime!;
      });
    }

    // 移除内容
    if (!params.includeContent) {
      filteredEntries = filteredEntries.map(entry => {
        const processedEntry = { ...entry };
        // 移除响应内容
        processedEntry.response.content.text = '';
        // 移除请求 postData
        delete processedEntry.request.postData;
        return processedEntry;
      });
    }

    // 创建处理后的 HAR 对象
    const processedHar: HarResult = {
      ...har,
      log: {
        ...har.log,
        entries: filteredEntries,
      },
    };

    return {
      success: true,
      pageInfo: {
        title: document.title,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      },
      har: processedHar,
      filteredEntriesCount: filteredEntries.length,
      totalEntriesCount: totalEntriesCount,
    };
  }
}

// 导出 Network 工具实例
export const NetworkTool = new NetworkToolImpl();
