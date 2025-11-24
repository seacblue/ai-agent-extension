// 导入 AI 客户端
import { DoubaoAIClient, ChatMessage } from '../shared/services/aiClient';
import { getApiKeyFromStorage, handleSetApiKey, handleGetApiKey, handleClearApiKey } from '../shared/services/api';
import { LongConnectionManager } from '../shared/services/longConnectionManager';

// 存储当前活跃的定时器和 AI 客户端
let currentAIProcess: { abort: () => void } | null = null
let currentAbortController: AbortController | null = null

// 扩展启动或安装时获取并保持 API Key
chrome.runtime.onStartup.addListener(async () => {
    try {
        // 启动时获取API Key，确保使用保存的值
        const apiKey = await getApiKeyFromStorage();
        console.log('扩展启动，获取 API Key 状态: ' + (apiKey ? '已配置' : '未配置'));
    } catch (error) {
        console.error('启动时获取 API Key 失败: ', error);
    }
});

// 监听来自 DevTools Panel 和 Content Script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ASK_QUESTION') {
        // 对于ASK_QUESTION请求，使用异步处理但立即返回成功，因为实际响应会通过长连接发送
        sendResponse({ type: 'processing', message: '问题处理中，通过长连接返回结果' })
        handleQuestion(request.question, request.requestId, sender, () => {})
        return false // 不需要保持通道开放，因为使用长连接进行异步通信
    } else if (request.type === 'GET_TAB_INFO') {
        handleTabInfo(sender.tab?.id, sendResponse)
        return true
    } else if (request.type === 'TERMINATE_PROCESS') {
          terminateTasks({ 
              responseMethod: 'sendResponse',
              sendResponse 
          })
          return true
    } else if (request.type === 'SET_API_KEY') {
        handleSetApiKey(request.apiKey, sendResponse)
        return true
    } else if (request.type === 'GET_API_KEY') {
        handleGetApiKey(sendResponse)
        return true
    } else if (request.type === 'CLEAR_API_KEY') {
        handleClearApiKey(sendResponse)
        return true
    }
    sendResponse({ type: 'unknown', message: '未知的消息类型' })
    return false
})

// 管理所有 Panel 连接
const panelPorts = new Map<string, chrome.runtime.Port>()

// 监听来自 Content Script 的长连接
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'question-response') {
        // 处理 Panel 连接
        const portId = `panel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        
        panelPorts.set(portId, port)
        console.log(`Panel 连接建立: ${portId}`)
        
        port.onDisconnect.addListener(() => { 
            panelPorts.delete(portId)
            console.log(`Panel 连接断开: ${portId}`)
            
            if (chrome.runtime.lastError) {
                console.error(`Panel 连接断开错误: ${chrome.runtime.lastError.message}`)
            }
        })
        
        // 监听来自 Panel 的消息
        port.onMessage.addListener((request) => {
            console.log('收到 Panel 消息:', request.type)
            if (request.type === 'TERMINATE') {
                terminateTasks({
                    responseMethod: 'portMessage',
                    port,
                    requestId: request.requestId
                })
            }
        })
        
        // 发送连接确认
        try {
            // 在发送消息前检查 port 是否有效
            if (port.sender) {
                port.postMessage({
                    type: 'CONNECTION_ACK',
                    portId: portId,
                    timestamp: new Date().toISOString()
                })
                console.log('发送连接确认成功: ', portId)
            } else {
                console.warn('连接已断开，无法发送确认: ', portId)
                // 如果 port 已失效，从集合中移除
                if (panelPorts.has(portId)) {
                    panelPorts.delete(portId)
                }
            }
        } catch (error) {
            console.error('发送 Panel 连接确认失败: ', error)
            // 发生错误时从集合中移除 port
            if (panelPorts.has(portId)) {
                panelPorts.delete(portId)
            }
        }
    }
})

async function handleTabInfo(tabId: number | undefined, sendResponse: (response: any) => void) {
    try {
        if (!tabId) {
            sendResponse({ error: '无法获取标签页信息' })
            return
        }
        
        const tab = await chrome.tabs.get(tabId)
        sendResponse({ 
            title: tab.title,
            url: tab.url,
            id: tab.id
        })
    } catch (error) {
        console.error('获取标签页信息失败: ', error)
        sendResponse({ error: '获取标签页信息失败' })
    }
}

// 处理终止请求
function terminateTasks(options: {
    responseMethod: 'sendResponse' | 'portMessage';
    sendResponse?: (response: any) => void;
    port?: chrome.runtime.Port;
    requestId?: string;
}) {
    try {
        // 中断当前 AI 进程
        if (currentAIProcess) {
            currentAIProcess.abort()
            currentAIProcess = null
        }
        
        // 中断当前的 AI 流式请求
        if (currentAbortController) {
            currentAbortController.abort()
            currentAbortController = null
        }
        
        const connectionManager = LongConnectionManager.getInstance()
        connectionManager.cleanup()
        
        // 根据不同的响应方式返回结果
        if (options.responseMethod === 'sendResponse' && options.sendResponse) {
            options.sendResponse({
                type: 'terminated',
                message: '所有任务已终止',
                status: 'success'
            })
        } else if (options.responseMethod === 'portMessage' && options.port) {
            options.port.postMessage({
                type: 'TERMINATE_RESPONSE',
                success: true,
                message: '所有任务已终止',
                requestId: options.requestId
            })
        }
    } catch (error) {
        console.error('处理终止请求失败: ', error)
        
        // 错误响应
        if (options.responseMethod === 'sendResponse' && options.sendResponse) {
            options.sendResponse({
                type: 'error',
                error: '终止任务失败: ' + (error as Error).message,
                status: 'error'
            })
        } else if (options.responseMethod === 'portMessage' && options.port) {
            options.port.postMessage({
                type: 'TERMINATE_RESPONSE',
                success: false,
                error: '终止任务失败: ' + (error as Error).message,
                requestId: options.requestId
            })
        }
    }
}

async function handleQuestion(question: string, requestId: string, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    let panelPort: chrome.runtime.Port | null = null
    
    try {
        // 检查是否已经有 Panel 连接
        const existingPorts = Array.from(panelPorts.values())
        if (existingPorts.length > 0) {
            // 使用现有的 Panel 连接
            panelPort = existingPorts[0]
            console.log('使用现有的 Panel 连接')
            
            // 发送连接确认
            try {
                // 在发送消息前检查 port 是否有效
                if (panelPort.sender) {
                    panelPort.postMessage({
                        type: 'CONNECTION_ACK',
                        portId: Array.from(panelPorts.keys())[0],
                        timestamp: new Date().toISOString()
                    })
                    console.log('发送连接确认成功: ', Array.from(panelPorts.keys())[0])
                } else {
                    console.warn('连接已断开或无效，无法发送确认')
                    panelPort = null
                    // 从 panelPorts 中移除断开的连接
                    const portId = Array.from(panelPorts.keys())[0]
                    if (portId) {
                        panelPorts.delete(portId)
                    }
                }
            } catch (error) {
                console.error('发送连接确认失败: ', error)
                panelPort = null
                // 从 panelPorts 中移除断开的连接
                const portId = Array.from(panelPorts.keys())[0]
                if (portId) {
                    panelPorts.delete(portId)
                }
            }
        } else {
            // 建立与 Panel 的长连接用于发送多个响应
            panelPort = chrome.runtime.connect({ name: 'question-response' })
            
            // 设置连接超时
            const connectionTimeout = setTimeout(() => {
                if (panelPort) {
                    console.warn('Panel 连接超时，断开连接')
                    panelPort = null
                }
            }, 5000)
            
            // 等待 Panel 的连接确认
            const connectionAckPromise = new Promise<void>((resolve, reject) => {
                let ackReceived = false
                
                panelPort!.onMessage.addListener((message) => {
                    if (message.type === 'CONNECTION_ACK') {
                        ackReceived = true
                        console.log('收到 Panel 连接确认: ', message.portId)
                        clearTimeout(connectionTimeout)
                        resolve()
                    }
                })
                
                panelPort!.onDisconnect.addListener(() => {
                    clearTimeout(connectionTimeout)
                    if (!ackReceived) {
                        if (chrome.runtime.lastError) {
                            console.error('Panel 连接断开: ', chrome.runtime.lastError.message)
                        }
                        reject(new Error('Panel 连接断开，未收到确认'))
                    }
                })
            })
            
            // 等待连接确认或超时
            await connectionAckPromise
            console.log('Background 与 Panel 长连接建立成功')
            
            // 重新设置断开监听器
            panelPort.onDisconnect.addListener(() => {
                console.log('Panel 连接已断开')
                panelPort = null
            })
        }
        
        const analysisDecision = await toolboxAnalysis(question, panelPort)

        // 获取标签页信息
        let tabId = (sender as any).tabId || sender.tab?.id
        if (!tabId) {
            const tabs = await chrome.tabs.query({})
            const activeTab = tabs.find(tab => tab.active) || tabs[0]
            tabId = activeTab?.id
        }
        
        if (!tabId) {
            if (panelPort) {
                try {
                    panelPort.postMessage({
                        type: 'ERROR',
                        error: '无法获取当前标签页信息，请确保在网页上打开 DevTools',
                        requestId: requestId
                    })
                } catch (error) {
                    console.error('发送标签页错误失败: ', error)
                }
            }
            return
        }

        // 构建 Prompt
        let promptParts = ['你是一个专业的AI开发者助手，擅长分析网页结构和回答技术问题。']
        
        function truncateData(data: any, maxLength: number = 10000): string {
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

        if (analysisDecision.shouldAnalyzeDOM) {
            try {
                if (panelPort) {
                    panelPort.postMessage({
                        type: 'THINKING',
                        content: '正在使用 DOM 分析工具...',
                        requestId: requestId
                    })
                }

                const connectionManager = LongConnectionManager.getInstance()
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
                )
                
                console.log('DOM 分析完成')
                
                if (domResult.success && domResult.results && domResult.results.length > 0) {
                    const truncatedDomData = truncateData(domResult.results[0].data, 8000);
                    promptParts.push(`DOM 分析数据：\n${truncatedDomData}`)
                } else {
                    console.warn('DOM 分析未返回有效结果')
                }
            } catch (error) {
                console.error('DOM 分析失败:', error)
            }
        }

        if (analysisDecision.shouldAnalyzeCSS) {
            try {
                if (panelPort) {
                    panelPort.postMessage({
                        type: 'THINKING',
                        content: '正在使用 CSS 分析工具...',
                        requestId: requestId
                    })
                }

                const connectionManager = LongConnectionManager.getInstance()
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
                )
                
                console.log('CSS 分析完成')
                
                if (cssResult.success && cssResult.results && cssResult.results.length > 0) {
                    const truncatedCssData = truncateData(cssResult.results[0].data, 5000);
                    promptParts.push(`CSS 分析数据：\n${truncatedCssData}`)
                } else {
                    console.warn('CSS 分析未返回有效结果')
                }
            } catch (error) {
                console.error('CSS 分析失败:', error)
            }
        }

        // 添加用户问题到 Prompt
        promptParts.push(`用户问题：${question}`)
        promptParts.push('请基于以上提供的分析数据（如果有）来回答用户的问题。如果没有相关数据，请直接回答用户的问题。')
        const fullPrompt = promptParts.join('\n\n');
        if (fullPrompt.length > 20000) {
            console.log(`警告：整体提示词长度 ${fullPrompt.length} 字符，可能接近 token 限制`);
            // 如果提示词太长，可以进一步精简或只保留最相关部分
            if (fullPrompt.length > 30000) {
                const emergencyTruncated = fullPrompt.substring(0, 30000) + '...\n[提示词已被截断以避免token超限]';
                promptParts = [emergencyTruncated];
            }
        }

        // 组合完整的 Prompt
        const finalPrompt = promptParts.join('\n\n')
        // 丢给 AI
        try {
            const apiKey = await getApiKeyFromStorage()
            if (!apiKey || apiKey.trim() === '') {
                if (panelPort) {
                    try {
                        panelPort.postMessage({
                            type: 'ERROR',
                            error: 'API 密钥未配置，请在设置中配置豆包 AI API 密钥',
                            requestId: requestId
                        })
                    } catch (error) {
                        console.error('发送 API 密钥错误失败: ', error)
                    }
                }
                return
            }
            const aiClient = new DoubaoAIClient(apiKey)
            
            // 创建 AbortController 用于中断请求
            currentAbortController = new AbortController()
            
            // 使用流式 API
            let isFirstChunk = true
            await aiClient.sendMessageStream(
                [
                    {
                        role: 'system',
                        content: '你是一个专业的网页分析和开发助手，专门帮助用户完成网页相关的任务。你需要分析页面结构、CSS样式、DOM元素等，并提供解决方案。请始终使用中文回答用户的问题。无论用户使用什么语言提问，都要用中文回复。'
                    },
                    {
                        role: 'user',
                        content: finalPrompt
                    }
                ],
                    // onChunk - 处理每个数据块
                    (chunk: string) => {
                        if (panelPort) {
                            try {
                                panelPort.postMessage({
                                    type: 'STREAMING_CONTENT',
                                    content: chunk,
                                    isFirstChunk: isFirstChunk,
                                    requestId: requestId
                                })
                            } catch (error) {
                                console.error('发送流式内容失败: ', error)
                                panelPort = null
                            }
                        }
                        isFirstChunk = false
                    },
                    // onComplete - 流式完成
                    () => {
                        currentAbortController = null
                        if (panelPort) {
                            try {
                                panelPort.postMessage({
                                    type: 'STREAMING_COMPLETE',
                                    requestId: requestId
                                })
                            } catch (error) {
                                console.error('发送完成消息失败: ', error)
                            }
                            panelPort = null
                        }
                    },
                    // onError - 错误处理
                    (error: Error) => {
                        currentAbortController = null
                        console.error('流式 API 调用失败: ', error)
                        if (panelPort) {
                            try {
                                panelPort.postMessage({
                                    type: 'ERROR',
                                    error: 'AI 生成失败: ' + error.message,
                                    requestId: requestId
                                })
                            } catch (sendError) {
                                console.error('发送错误消息失败: ', sendError)
                            }
                            panelPort = null
                        }
                    },
                    // abortSignal - 中断信号
                    currentAbortController.signal
                )
            } catch (error) {
                console.error('AI 调用过程中出错: ', error)
                if (panelPort) {
                    try {
                        panelPort.postMessage({
                            type: 'ERROR',
                            error: 'AI 调用失败: ' + (error as Error).message,
                            requestId: requestId
                        })
                    } catch (sendError) {
                        console.error('发送错误消息失败: ', sendError)
                    }
                    panelPort = null
                }
            }
    } catch (error) {
        console.error('处理问题时出错: ', error)
        sendResponse({
            success: false,
            error: error instanceof Error ? error.message : '处理问题时出现未知错误'
        })
    }
}

// 合并的页面分析判断函数
async function toolboxAnalysis(question: string, panelPort?: chrome.runtime.Port | null): Promise<{
    shouldAnalyzeDOM: boolean,
    shouldAnalyzeCSS: boolean,
    targetElement?: string
}> {
    try {
        const apiKey = await getApiKeyFromStorage()
        if (!apiKey || apiKey.trim() === '') {
            // API 密钥无效，通知 panel
            if (panelPort) {
                try {
                    panelPort.postMessage({
                        type: 'ERROR',
                        content: 'API 密钥未配置，请在设置中配置豆包 AI API 密钥',
                        timestamp: new Date().toISOString(),
                        id: Date.now()
                    })
                } catch (error) {
                    console.error('发送 API 密钥错误通知失败: ', error)
                }
            }
        }
        
        const aiClient = new DoubaoAIClient(apiKey)
        
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

只返回 JSON，不要其他内容。`

        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: '你是一个专业的分析助手，擅长判断用户问题的分析需求。只返回 JSON 格式的结果。'
            },
            {
                role: 'user',
                content: analysisPrompt
            }
        ]

        const response = await aiClient.sendMessage(messages)
        console.log('AI 原始响应:', JSON.stringify(response, null, 2))
        
        try {
            // 从 ChatCompletionResponse 中提取 content
            const content = response.choices?.[0]?.message?.content || ''
            const result = JSON.parse(content)
            
            const finalResult = {
                shouldAnalyzeDOM: Boolean(result.shouldAnalyzeDOM),
                shouldAnalyzeCSS: Boolean(result.shouldAnalyzeCSS),
                targetElement: result.targetElement || undefined
            }
            return finalResult
        } catch (parseError) {
            return { shouldAnalyzeDOM: false, shouldAnalyzeCSS: false }
        }
    } catch (error) {
        return { shouldAnalyzeDOM: false, shouldAnalyzeCSS: false }
    }
}
