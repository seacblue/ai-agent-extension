// API 配置管理
export const API_CONFIG = {
  // 豆包 AI API 配置
  VOLCES: {
    API_URL: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    MODEL: 'doubao-seed-1-6-251015',
    // 从环境变量获取 API 密钥
    getApiKey: async () => {
      // 在开发环境中，可以通过 import.meta.env 获取环境变量
      // 在扩展环境中，需要通过其他方式获取
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        return import.meta.env.VOLCES_API_KEY || '';
      }
      // 从 Chrome 存储中获取
      return await getApiKeyFromStorage();
    }
  }
};

// 从 Chrome 存储中获取 API 密钥
export async function getApiKeyFromStorage(): Promise<string> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['volcesApiKey'], (result) => {
        const apiKey = result.volcesApiKey as string | undefined;
        
        // 如果未设置，返回空字符串；如果设置了，直接返回值（包括空字符串）
        if (apiKey === undefined) {
          resolve('');
        } else {
          resolve(apiKey);
        }
      });
    } else {
      resolve('');
    }
  });
}

// 保存 API 密钥到 Chrome 存储
export async function saveApiKey(apiKey: string, allowEmpty: boolean = false): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      // 验证 API 密钥格式（除非允许空值）
      if (!allowEmpty && (!apiKey || apiKey.trim().length === 0)) {
        reject(new Error('API 密钥不能为空'));
        return;
      }
      
      const trimmedApiKey = apiKey.trim();
      
      chrome.storage.local.set({ volcesApiKey: trimmedApiKey }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    } else {
      reject(new Error('Chrome 存储不可用'));
    }
  });
}

export async function isApiKeyConfigured(): Promise<boolean> {
  const apiKey = await getApiKeyFromStorage();
  return Boolean(apiKey && apiKey.trim().length > 0);
}

// 处理设置 API 密钥
export async function handleSetApiKey(apiKey: string, sendResponse: (response: any) => void): Promise<void> {
  try {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('API 密钥不能为空');
    }
    
    await saveApiKey(apiKey.trim())
    sendResponse({
      type: 'success',
      message: 'API 密钥保存成功',
      status: 'success'
    })
  } catch (error) {
    console.error('保存 API 密钥失败: ', error)
    sendResponse({
      type: 'error',
      error: '保存 API 密钥失败: ' + (error as Error).message,
      status: 'error'
    })
  }
}

// 处理获取 API 密钥
export async function handleGetApiKey(sendResponse: (response: any) => void): Promise<void> {
  try {
    const apiKey = await getApiKeyFromStorage()
    const hasKey = apiKey && apiKey.trim().length > 0
    sendResponse({
      type: 'success',
      configured: hasKey,
      apiKey: hasKey ? apiKey : null,
      status: 'success'
    })
  } catch (error) {
    console.error('获取 API 密钥状态失败: ', error)
    sendResponse({
      type: 'error',
      error: '获取 API 密钥状态失败: ' + (error as Error).message,
      status: 'error',
      configured: false,
      apiKey: null
    })
  }
}

// 处理清空 API 密钥
export async function handleClearApiKey(sendResponse: (response: any) => void): Promise<void> {
  try {
    await saveApiKey('', true) // 允许空值来清空 API 密钥
    sendResponse({
      type: 'success',
      message: 'API 密钥已清空',
      status: 'success'
    })
  } catch (error) {
    console.error('清空 API 密钥失败: ', error)
    sendResponse({
      type: 'error',
      error: '清空 API 密钥失败: ' + (error as Error).message,
      status: 'error'
    })
  }
}
