// 加密服务，提供 API 密钥的加密存储和传输功能

/**
 * 加密服务类，提供数据加密和解密功能
 */
export class CryptoService {
  private static instance: CryptoService;
  private cryptoKey: CryptoKey | null = null;
  private keyName = 'extension_encryption_key';

  /**
   * 获取加密服务单例实例
   */
  public static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  /**
   * 初始化加密密钥
   */
  private async initializeKey(): Promise<CryptoKey> {
    if (this.cryptoKey) {
      return this.cryptoKey;
    }

    try {
      // 检查浏览器是否支持加密 API（兼容扩展环境）
      const cryptoObj =
        typeof window !== 'undefined'
          ? window.crypto
          : typeof crypto !== 'undefined'
            ? crypto
            : null;
      if (!cryptoObj || !cryptoObj.subtle) {
        throw new Error('当前环境不支持 Web Crypto API');
      }

      // 尝试从 IndexedDB 获取密钥
      const storedKey = await this.getKeyFromStorage();
      if (storedKey) {
        this.cryptoKey = storedKey;
        return storedKey;
      }

      // 生成新的加密密钥
      const key = await cryptoObj.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256,
        },
        true,
        ['encrypt', 'decrypt']
      );

      // 存储密钥
      await this.saveKeyToStorage(key);
      this.cryptoKey = key;
      return key;
    } catch (error) {
      console.error('初始化加密密钥失败:', error);
      throw new Error('加密服务初始化失败');
    }
  }

  /**
   * 将加密密钥保存到 Chrome 存储
   */
  private async saveKeyToStorage(key: CryptoKey): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 获取 crypto 对象（兼容扩展环境）
        const cryptoObj =
          typeof window !== 'undefined'
            ? window.crypto
            : typeof crypto !== 'undefined'
              ? crypto
              : null;
        if (!cryptoObj || !cryptoObj.subtle) {
          reject(new Error('当前环境不支持 Web Crypto API'));
          return;
        }

        // 导出密钥为可存储格式
        cryptoObj.subtle
          .exportKey('jwk', key)
          .then(jwk => {
            // 使用 Chrome 存储保存密钥
            chrome.storage.local.set({ [this.keyName]: jwk }, () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          })
          .catch(error => {
            reject(new Error('导出密钥失败: ' + error.message));
          });
      } catch (error) {
        reject(new Error('保存密钥失败: ' + (error as Error).message));
      }
    });
  }

  /**
   * 从 IndexedDB 获取加密密钥
   */
  private async getKeyFromStorage(): Promise<CryptoKey | null> {
    return new Promise((resolve, reject) => {
      try {
        // 从 Chrome 存储获取密钥
        chrome.storage.local.get([this.keyName], result => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          const jwk = result[this.keyName];
          if (!jwk) {
            resolve(null);
            return;
          }

          // 获取 crypto 对象（兼容扩展环境）
          const cryptoObj =
            typeof window !== 'undefined'
              ? window.crypto
              : typeof crypto !== 'undefined'
                ? crypto
                : null;
          if (!cryptoObj || !cryptoObj.subtle) {
            console.error('当前环境不支持 Web Crypto API');
            resolve(null);
            return;
          }

          // 导入密钥
          cryptoObj.subtle
            .importKey(
              'jwk',
              jwk,
              {
                name: 'AES-GCM',
              },
              true,
              ['encrypt', 'decrypt']
            )
            .then(key => {
              resolve(key);
            })
            .catch(error => {
              console.error('导入密钥失败:', error);
              resolve(null);
            });
        });
      } catch (error) {
        console.error('获取密钥失败:', error);
        resolve(null);
      }
    });
  }

  /**
   * 加密数据
   * @param data - 要加密的数据
   * @returns 加密后的字符串
   */
  public async encrypt(data: string): Promise<string> {
    try {
      const key = await this.initializeKey();
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);

      // 获取 crypto 对象（兼容扩展环境）
      const cryptoObj =
        typeof window !== 'undefined'
          ? window.crypto
          : typeof crypto !== 'undefined'
            ? crypto
            : null;
      if (!cryptoObj) {
        throw new Error('当前环境不支持加密功能');
      }

      // 生成随机初始化向量
      const iv = cryptoObj.getRandomValues(new Uint8Array(12));

      // 加密数据
      const encryptedBuffer = await cryptoObj.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        key,
        dataBuffer
      );

      // 组合 IV 和加密数据
      const combinedBuffer = new Uint8Array(
        iv.length + encryptedBuffer.byteLength
      );
      combinedBuffer.set(iv);
      combinedBuffer.set(new Uint8Array(encryptedBuffer), iv.length);

      // 转换为 Base64 字符串
      return btoa(String.fromCharCode(...combinedBuffer));
    } catch (error) {
      console.error('加密数据失败:', error);
      throw new Error('加密数据失败');
    }
  }

  /**
   * 解密数据
   * @param encryptedData - 加密的数据
   * @returns 解密后的字符串
   */
  public async decrypt(encryptedData: string): Promise<string> {
    try {
      const key = await this.initializeKey();

      // 从 Base64 转换为 ArrayBuffer
      const combinedBuffer = new Uint8Array(
        atob(encryptedData)
          .split('')
          .map(char => char.charCodeAt(0))
      );

      // 提取 IV 和加密数据
      const iv = combinedBuffer.slice(0, 12);
      const encryptedBuffer = combinedBuffer.slice(12);

      // 获取 crypto 对象（兼容扩展环境）
      const cryptoObj =
        typeof window !== 'undefined'
          ? window.crypto
          : typeof crypto !== 'undefined'
            ? crypto
            : null;
      if (!cryptoObj || !cryptoObj.subtle) {
        throw new Error('当前环境不支持 Web Crypto API');
      }

      // 解密数据
      const decryptedBuffer = await cryptoObj.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        key,
        encryptedBuffer
      );

      // 转换为字符串
      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } catch (error) {
      console.error('解密数据失败: ', error);
      throw new Error('解密数据失败');
    }
  }

  /**
   * 安全地生成短期令牌（用于 API 调用）
   * @param apiKey - 原始 API 密钥
   * @returns 短期令牌
   */
  public async generateShortLivedToken(apiKey: string): Promise<string> {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const tokenData = {
        key: apiKey,
        expires: timestamp + 300, // 5分钟过期
        nonce: Math.random().toString(36).substring(2, 15),
      };

      return this.encrypt(JSON.stringify(tokenData));
    } catch (error) {
      console.error('生成短期令牌失败: ', error);
      // 如果令牌生成失败，回退到使用原始密钥（安全降级）
      return apiKey;
    }
  }

  /**
   * 验证并提取短期令牌中的 API 密钥
   * @param token - 短期令牌
   * @returns 原始 API 密钥
   */
  public async validateAndExtractToken(token: string): Promise<string> {
    try {
      const decoded = await this.decrypt(token);
      const tokenData = JSON.parse(decoded);

      // 检查令牌是否过期
      const now = Math.floor(Date.now() / 1000);
      if (tokenData.expires && tokenData.expires < now) {
        throw new Error('令牌已过期');
      }

      return tokenData.key;
    } catch (error) {
      console.error('验证令牌失败: ', error);
      // 如果令牌验证失败，尝试将 token 作为原始密钥使用
      return token;
    }
  }
}
