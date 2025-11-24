class LongConnectionManager {
    private static instance: LongConnectionManager
    private pendingConnections: Map<string, {
        resolve: (value: any) => void
        reject: (reason: any) => void
        timeout: NodeJS.Timeout
    }> = new Map()

    static getInstance(): LongConnectionManager {
        if (!LongConnectionManager.instance) {
            LongConnectionManager.instance = new LongConnectionManager()
        }
        return LongConnectionManager.instance
    }

    // 发送长连接请求并等待响应
    async sendLongConnectionRequest(
        tabId: number,
        messageType: string,
        requestData: any,
        connectionName: string,
        timeout: number = 12000
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            // 生成唯一的请求 ID
            const requestId = `${messageType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            
            // 设置超时
            const timeoutHandle = setTimeout(() => {
                this.pendingConnections.delete(requestId)
                reject(new Error(`${messageType} 长连接请求超时`))
            }, timeout)

            // 存储回调
            this.pendingConnections.set(requestId, {
                resolve,
                reject,
                timeout: timeoutHandle
            })

            // 监听长连接响应
            const listener = (port: chrome.runtime.Port) => {
                if (port.name === connectionName) {
                    port.onMessage.addListener((message) => {
                        if (message.requestId === requestId) {
                            // 清理超时和回调
                            const pending = this.pendingConnections.get(requestId)
                            if (pending) {
                                clearTimeout(pending.timeout)
                                this.pendingConnections.delete(requestId)
                            }
                            
                            // 移除监听器
                            chrome.runtime.onConnect.removeListener(listener)
                            
                            if (message.success) {
                                resolve(message.data)
                            } else {
                                reject(new Error(message.error || '请求失败'))
                            }
                        }
                    })

                    port.onDisconnect.addListener(() => {
                        if (chrome.runtime.lastError) {
                            console.error(`${connectionName} 长连接断开错误:`, chrome.runtime.lastError.message)
                        }
                    })
                }
            }

            chrome.runtime.onConnect.addListener(listener)

            // 发送初始消息到 Content Script
            chrome.tabs.sendMessage(tabId, {
                type: messageType,
                requestId: requestId,
                ...requestData
            }, (response: any) => {
                if (chrome.runtime.lastError) {
                    // 清理资源
                    const pending = this.pendingConnections.get(requestId)
                    if (pending) {
                        clearTimeout(pending.timeout)
                        this.pendingConnections.delete(requestId)
                    }
                    chrome.runtime.onConnect.removeListener(listener)
                    reject(new Error(chrome.runtime.lastError.message))
                } else if (response?.type === 'processing') {
                    // 正在处理中，等待长连接结果
                    console.log(`${messageType} 正在处理中，等待长连接结果`)
                } else {
                    // 直接返回结果
                    const pending = this.pendingConnections.get(requestId)
                    if (pending) {
                        clearTimeout(pending.timeout)
                        this.pendingConnections.delete(requestId)
                    }
                    chrome.runtime.onConnect.removeListener(listener)
                    resolve(response)
                }
            })
        })
    }

    // 清理所有待处理的连接
    cleanup(): void {
        this.pendingConnections.forEach(({ timeout }) => {
            clearTimeout(timeout)
        })
        this.pendingConnections.clear()
    }
}

export { LongConnectionManager };