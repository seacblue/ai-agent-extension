import { registerAllTools, toolManager } from "../tools";

registerAllTools()

// 监听来自 DevTools Panel 的消息
chrome.runtime.onMessage.addListener(async (request, _sender, sendResponse) => {
    if (request.type === 'GET_PAGE_DOM') {
        try {
            // 检查页面是否仍然有效
            if (!document || !document.documentElement) {
                console.error('页面不再有效')
                sendResponse({
                    type: 'error',
                    error: '页面不再有效，可能已导航或卸载'
                })
                return true
            }
            
            // 立即发送一个初始响应，然后通过长连接发送详细数据
            sendResponse({
                type: 'processing',
                message: '开始分析页面数据...'
            })
            
            // 使用长连接发送详细数据
            try {
                const port = chrome.runtime.connect({ name: 'dom-analysis-result' })
                // 等待连接建立后再发送数据
                setTimeout(async () => {
                    try {
                        const result = await toolManager.executeTool('getDOM', {
                            domOptions: { maxDepth: 10, includeAttributes: true, includeStyles: false },
                            htmlOptions: { format: false }
                        }, {
                            tabId: request.tabId,
                            timestamp: new Date().toISOString(),
                            requestId: request.requestId
                        });

                        if (result.success && result.data) {
                            // 通过长连接发送数据
                            port.postMessage({
                                type: 'DOM_ANALYSIS_RESULT',
                                success: true,
                                pageData: result.data
                            })
                        } else {
                            // 发送错误响应
                            port.postMessage({
                                type: 'DOM_ANALYSIS_RESULT',
                                success: false,
                                error: result.error || 'DOM 分析失败'
                            })
                        }
                        
                        // 延迟关闭端口
                        setTimeout(() => {
                            port.disconnect()
                        }, 1000)
                    } catch (analysisError) {
                        console.error('DOM 分析过程出错: ', analysisError)
                        
                        // 通过同一个长连接发送错误
                        try {
                            port.postMessage({
                                type: 'DOM_ANALYSIS_RESULT',
                                success: false,
                                error: analysisError instanceof Error ? analysisError.message : String(analysisError)
                            })
                            setTimeout(() => {
                                port.disconnect()
                            }, 1000)
                        } catch (portError) {
                            console.error('发送错误响应时出错: ', portError)
                        }
                    }
                }, 100) // 给连接建立一点时间
                
            } catch (portError) {
                console.error('创建长连接时出错: ', portError)
                sendResponse({
                    type: 'error',
                    error: '无法建立长连接: ' + (portError instanceof Error ? portError.message : String(portError))
                })
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error('Content Script 处理 GET_PAGE_DOM 时出错: ', error)
            sendResponse({
                type: 'error',
                error: errorMessage
            })
        }
        return true // 保持异步响应通道开放
    } else if (request.type === 'EXECUTE_TOOLS') {
        try {
            const { keywords, params, context } = request;
            
            // 使用工具管理器根据关键词执行工具
            const results = await toolManager.executeToolsByKeywords(
                keywords || [],
                params || {},
                context || {}
            );

            sendResponse({
                type: 'TOOLS_EXECUTION_RESULT',
                success: true,
                results
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Content Script 处理 EXECUTE_TOOLS 时出错: ', error);
            sendResponse({
                type: 'error',
                error: errorMessage
            });
        }
        return true;
    } else {
        console.log('Content Script 收到未知消息类型:', request.type)
        return false
    }
})

// 创建与 Background Script 的长连接，添加错误处理和重试机制
let port: chrome.runtime.Port | null = null
let retryCount = 0
const maxRetries = 3
let connectionEstablished = false
let connectionTimeout: NodeJS.Timeout | null = null
let isReconnecting = false // 防止重复重连

function connectToBackground() {
    // 防止重复重连
    if (isReconnecting) {
        return
    }
    
    isReconnecting = true
    
    try {
        port = chrome.runtime.connect({ name: 'content-script' })
        
        // 设置连接超时
        connectionTimeout = setTimeout(() => {
            if (!connectionEstablished) {
                console.log('连接超时，关闭端口')
                port?.disconnect()
                port = null
                handleConnectionFailure('连接超时')
            }
        }, 5000) // 5 秒超时
        
        // 监听来自 Background 的消息
        port.onMessage.addListener((message) => {
            if (message.type === 'CONNECTION_ACK') {
                connectionEstablished = true
                isReconnecting = false

                // 清除超时定时器
                if (connectionTimeout) {
                    clearTimeout(connectionTimeout)
                    connectionTimeout = null
                }
                
                // 重置重试计数
                retryCount = 0
                console.log('Content Script 与 Background 连接已建立')
            }
        })
        
        // 监听连接断开事件
        port.onDisconnect.addListener(() => {
            const disconnectReason = chrome.runtime.lastError?.message || '未知原因'
            
            // 清除超时定时器
            if (connectionTimeout) {
                clearTimeout(connectionTimeout)
                connectionTimeout = null
            }
            
            connectionEstablished = false
            port = null
            isReconnecting = false
            
            // 只有在异常断开时才重试
            if (retryCount < maxRetries && disconnectReason !== '正常断开') {
                retryCount++
                console.log(`Content Script 已丢失与 Background 的连接，断开原因: ${disconnectReason}`)
                console.log(`Retrying connection (${retryCount}/${maxRetries})`)
                setTimeout(connectToBackground, 3000)
            } else if (retryCount >= maxRetries) {
                console.log('已达到最大重试次数，停止重试')
            }
        })
        
    } catch (error) {
        console.error('Content Script 连接失败: ', error)
        handleConnectionFailure(error)
    }
}

function handleConnectionFailure(error: any) {
    connectionEstablished = false
    port = null
    isReconnecting = false
    
    // 清除超时定时器
    if (connectionTimeout) {
        clearTimeout(connectionTimeout)
        connectionTimeout = null
    }
    
    if (retryCount < maxRetries) {
        retryCount++
        console.log(`连接失败，准备重试 (${retryCount}/${maxRetries}):`, error)
        setTimeout(connectToBackground, 3000) // 增加重试间隔
    } else {
        console.log('已达到最大重试次数，停止重试')
    }
}

// 初始化连接
setTimeout(connectToBackground, 1000) // 延迟 1 秒连接，确保页面稳定
