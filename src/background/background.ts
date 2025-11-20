// 导入 AI 客户端
import { DoubaoAIClient, ChatMessage } from './ai-client'
import { getApiKeyFromStorage, saveApiKey } from '../config/api'

// 存储当前活跃的定时器和 AI 客户端
let activeTimers: NodeJS.Timeout[] = []
let currentAIProcess: { abort: () => void } | null = null
let currentAbortController: AbortController | null = null

// 长连接通信工具类
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
                            port.disconnect()
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

// 监听来自 DevTools Panel 和 Content Script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ASK_QUESTION') {
        handleQuestion(request.question, request.requestId, sender, sendResponse)
        return true
    } else if (request.type === 'GET_TAB_INFO') {
        handleTabInfo(sender.tab?.id, sendResponse)
        return true
    } else if (request.type === 'TERMINATE_PROCESS') {
        handleTerminate(sendResponse)
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
            handleTerminateFromPanel(request, port)
            }
            // 可以在这里添加更多消息类型的处理
        })
        
        // 发送连接确认
        try {
            port.postMessage({
                type: 'CONNECTION_ACK',
                portId: portId,
                timestamp: new Date().toISOString()
            })
        } catch (error) {
            console.error('发送 Panel 连接确认失败: ', error)
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

// 处理设置 API 密钥
async function handleSetApiKey(apiKey: string, sendResponse: (response: any) => void) {
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
async function handleGetApiKey(sendResponse: (response: any) => void) {
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
async function handleClearApiKey(sendResponse: (response: any) => void) {
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

// 处理终止请求
function handleTerminate(sendResponse: (response: any) => void) {
    try {
        // 清除所有活跃的定时器
        activeTimers.forEach(timer => { clearTimeout(timer) })
        
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
        
        // 清理长连接管理器
        const connectionManager = LongConnectionManager.getInstance()
        connectionManager.cleanup()
        
        // 清空定时器数组
        activeTimers = []
        
        sendResponse({
            type: 'terminated',
            message: '所有任务已终止',
            status: 'success'
        })
    } catch (error) {
        console.error('处理终止请求失败: ', error)
        sendResponse({
            type: 'error',
            error: '终止任务失败: ' + (error as Error).message,
            status: 'error'
        })
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
                panelPort.postMessage({
                    type: 'CONNECTION_ACK',
                    portId: Array.from(panelPorts.keys())[0],
                    timestamp: new Date().toISOString()
                })
            } catch (error) {
                console.error('发送连接确认失败: ', error)
            }
        } else {
            // 建立与 Panel 的长连接用于发送多个响应
            panelPort = chrome.runtime.connect({ name: 'question-response' })
            
            // 设置连接超时
            const connectionTimeout = setTimeout(() => {
                if (panelPort) {
                    console.warn('Panel 连接超时，断开连接')
                    panelPort.disconnect()
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
        
        const analysisDecision = await toolboxAnalysis(question)

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
                    panelPort.disconnect()
                } catch (error) {
                    console.error('发送标签页错误失败: ', error)
                }
            }
            return
        }

        // 构建 Prompt
        let promptParts = ['你是一个专业的AI开发者助手，擅长分析网页结构和回答技术问题。']

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
                                includeStyles: true,
                                includeAttributes: true,
                                maxDepth: 8
                            },
                            htmlOptions: {
                                format: true,
                                includeDoctype: true
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
                    promptParts.push(`DOM 分析数据：\n${JSON.stringify(domResult.results[0].data, null, 2)}`)
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
                            includeAll: true
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
                    console.log(`CSS分析数据：\n${JSON.stringify(cssResult.results[0].data, null, 2)}`)
                    promptParts.push(`CSS分析数据：\n${JSON.stringify(cssResult.results[0].data, null, 2)}`)
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
                        panelPort.disconnect()
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
                                panelPort.disconnect()
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
                                panelPort.disconnect()
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
                        panelPort.disconnect()
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

// 关键词匹配辅助函数
function containsDOMKeywords(question: string, keywords: string[]): boolean {
    const lowerQuestion = question.toLowerCase()
    return keywords.some(keyword => lowerQuestion.includes(keyword))
}

function containsCSSKeywords(question: string, keywords: string[]): boolean {
    const lowerQuestion = question.toLowerCase()
    return keywords.some(keyword => lowerQuestion.includes(keyword))
}

// 合并的页面分析判断函数
async function toolboxAnalysis(question: string): Promise<{
    shouldAnalyzeDOM: boolean,
    shouldAnalyzeCSS: boolean,
    targetElement?: string
}> {
    try {
        const apiKey = await getApiKeyFromStorage()
        if (!apiKey) {
            // 回退到关键词匹配
            const domResult = containsDOMKeywords(question, [
                'dom', '元素', 'element', '标签', 'tag', '内容', 'content', '文本', 'text',
                '结构', 'structure', 'html', '节点', 'node', '属性', 'attribute', 'class', 'id',
                '选择器', 'selector', '父元素', '子元素', '兄弟元素', '查找', 'find', '获取', 'get'
            ])
            const cssResult = containsCSSKeywords(question, [
                'css', '样式', 'style', '颜色', '布局', 'layout', 'design', '设计',
                '美化', '动画', 'animation', '响应式', 'responsive', '主题', 'theme',
                '字体', 'font', '背景', 'background', '边框', 'border', '阴影', 'shadow',
                '渐变', 'gradient', 'flex', 'grid', 'position', 'display', 'margin',
                'padding', 'width', 'height', 'class', 'id', 'selector', '选择器'
            ])
            return { shouldAnalyzeDOM: domResult, shouldAnalyzeCSS: cssResult }
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
            // 如果解析失败，回退到关键词匹配
            const domResult = containsDOMKeywords(question, [
                'dom', '元素', 'element', '标签', 'tag', '内容', 'content', '文本', 'text',
                '结构', 'structure', 'html', '节点', 'node', '属性', 'attribute', 'class', 'id',
                '选择器', 'selector', '父元素', '子元素', '兄弟元素', '查找', 'find', '获取', 'get'
            ])
            const cssResult = containsCSSKeywords(question, [
                'css', '样式', 'style', '颜色', '布局', 'layout', 'design', '设计',
                '美化', '动画', 'animation', '响应式', 'responsive', '主题', 'theme',
                '字体', 'font', '背景', 'background', '边框', 'border', '阴影', 'shadow',
                '渐变', 'gradient', 'flex', 'grid', 'position', 'display', 'margin',
                'padding', 'width', 'height', 'class', 'id', 'selector', '选择器'
            ])
            console.log('🔄 回退到关键词匹配 - DOM:', domResult, 'CSS:', cssResult)
            return { shouldAnalyzeDOM: domResult, shouldAnalyzeCSS: cssResult }
        }
    } catch (error) {
        // 如果 AI 判断失败，回退到关键词匹配
        const domResult = containsDOMKeywords(question, [
            'dom', '元素', 'element', '标签', 'tag', '内容', 'content', '文本', 'text',
            '结构', 'structure', 'html', '节点', 'node', '属性', 'attribute', 'class', 'id',
            '选择器', 'selector', '父元素', '子元素', '兄弟元素', '查找', 'find', '获取', 'get'
        ])
        const cssResult = containsCSSKeywords(question, [
            'css', '样式', 'style', '颜色', '布局', 'layout', 'design', '设计',
            '美化', '动画', 'animation', '响应式', 'responsive', '主题', 'theme',
            '字体', 'font', '背景', 'background', '边框', 'border', '阴影', 'shadow',
            '渐变', 'gradient', 'flex', 'grid', 'position', 'display', 'margin',
            'padding', 'width', 'height', 'class', 'id', 'selector', '选择器'
        ])
        return { shouldAnalyzeDOM: domResult, shouldAnalyzeCSS: cssResult }
    }
}



// 处理来自 Panel 的终止请求
function handleTerminateFromPanel(request: any, port: chrome.runtime.Port) {
    try {
        console.log('处理来自 Panel 的终止请求: ', request)
        
        // 清除所有活跃的定时器
        activeTimers.forEach(timer => { clearTimeout(timer) })
        
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
        
        // 清理长连接管理器
        const connectionManager = LongConnectionManager.getInstance()
        connectionManager.cleanup()
        
        // 清空定时器数组
        activeTimers = []
        
        port.postMessage({
            type: 'TERMINATE_RESPONSE',
            success: true,
            message: '所有任务已终止',
            requestId: request.requestId
        })
    } catch (error) {
        console.error('处理 Panel 终止请求失败: ', error)
        port.postMessage({
            type: 'TERMINATE_RESPONSE',
            success: false,
            error: '终止任务失败: ' + (error as Error).message,
            requestId: request.requestId
        })
    }
}
