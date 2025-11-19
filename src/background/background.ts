// 导入 AI 客户端
import { DoubaoAIClient, ChatMessage } from './ai-client'
import { getApiKeyFromStorage, saveApiKey } from '../config/api'

// 存储当前活跃的定时器和 AI 客户端
let activeTimers: NodeJS.Timeout[] = []
let currentAIProcess: { abort: () => void } | null = null
let currentAbortController: AbortController | null = null

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

// 管理所有 Content Script 连接
const contentScriptPorts = new Map<string, chrome.runtime.Port>()

// 管理所有 Panel 连接
const panelPorts = new Map<string, chrome.runtime.Port>()

// 监听来自 Content Script 的长连接
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'content-script') {
        const portId = `${port.sender?.tab?.id || 'unknown'}-${Date.now()}`
        
        contentScriptPorts.set(portId, port)
        port.onDisconnect.addListener(() => { 
            contentScriptPorts.delete(portId)
            console.log(`Content Script 连接断开: ${portId}`)
        })
        
        // 发送确认消息
        try {
            port.postMessage({
                type: 'CONNECTION_ACK',
                portId: portId,
                timestamp: new Date().toISOString()
            })
        } catch (error) {
            console.error('发送连接确认失败: ', error)
        }
    } else if (port.name === 'question-response') {
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
        // 询问 AI 是否需要使用 DOM 检测工具
        const domAnalysis = await shouldUseDOMAnalysis(question)

        if (domAnalysis.shouldAnalyze) {
            if (panelPort) {
                    try {
                        panelPort.postMessage({
                            type: 'thinking',
                            content: '正在使用 DOM 分析工具...',
                            requestId: requestId
                        })
                    } catch (error) {
                        console.error('发送思考状态失败: ', error)
                        panelPort = null
                    }
                }

            // 优先使用消息中传递的 tabId，然后是 sender.tab.id，最后才查询
            let tabId = (sender as any).tabId || sender.tab?.id
            // 如果没有 tabId，尝试获取 DevTools 相关的标签页
            if (!tabId) {
                // 尝试通过其他方式获取标签页
                const tabs = await chrome.tabs.query({})
                // 查找最近活动的标签页
                const activeTab = tabs.find(tab => tab.active) || tabs[0]
                tabId = activeTab?.id
            }
            
            if (!tabId) {
                if (panelPort) {
                    try {
                        panelPort.postMessage({
                            type: 'error',
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

            try {
                // 设置超时时间的 Promise
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(
                        new Error('请求超时：Content Script 未在 10 秒内响应')),
                        10000
                    )
                })
                
                // 使用 Promise 包装 sendMessage 以正确处理异步响应，并添加超时处理
                const response = await Promise.race([
                    new Promise<any>((resolve, reject) => {
                        chrome.tabs.sendMessage(tabId, {
                            type: 'GET_PAGE_DOM'
                        }, (response : any) => {
                            if (chrome.runtime.lastError) {
                                const errorMessage = chrome.runtime.lastError.message || '未知 Chrome 运行时错误'
                                console.error('Chrome 运行时错误: ', errorMessage)
                                reject(new Error(errorMessage))
                            } else {
                                resolve(response)
                            }
                        })
                    }),
                    timeoutPromise
                ])
                
                // 如果收到处理中响应，等待长连接的详细数据
                if (response?.type === 'processing') {
                    
                    // 创建一个 Promise 来等待长连接的结果
                    const detailedDataPromise = new Promise((resolve, reject) => {
                        // 监听长连接
                        chrome.runtime.onConnect.addListener((port) => {
                            if (port.name === 'dom-analysis-result') {
                                port.onMessage.addListener((message) => {
                                    if (message.type === 'DOM_ANALYSIS_RESULT') {
                                        if (message.success) {
                                            resolve(message.pageData)
                                        } else {
                                            console.error('收到 DOM 分析错误: ', message.error)
                                            reject(new Error(message.error))
                                        }
                                        port.disconnect()
                                    }
                                })
                                
                                port.onDisconnect.addListener(() => {
                                    if (chrome.runtime.lastError) {
                                        console.error('长连接断开错误: ', chrome.runtime.lastError.message)
                                    }
                                })
                            }
                        })
                        
                        // 设置长连接超时
                        setTimeout(() => {
                            reject(new Error('长连接数据传输超时'))
                        }, 12000)
                    })
                    
                    try {
                        const pageData = await detailedDataPromise as any
                        
                        // 构建包含页面数据的 AI 提示
                        const prompt = buildAIPrompt(question, pageData)
                        const apiKey = await getApiKeyFromStorage()
                        if (!apiKey || apiKey.trim() === '') {
                            if (panelPort) {
                                try {
                                    panelPort.postMessage({
                                        type: 'error',
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
                            [{
                                role: 'user',
                                content: prompt
                            }],
                            // onChunk - 处理每个数据块
                            (chunk: string) => {
                                if (panelPort) {
                            try {
                                panelPort.postMessage({
                                    type: 'streaming_content',
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
                                            type: 'streaming_complete',
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
                                            type: 'error',
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
                    } catch (detailedError) {
                        console.error('获取详细数据时出错: ', detailedError)
                        if (panelPort) {
                            try {
                                panelPort.postMessage({
                                    type: 'error',
                                    error: '获取页面详细数据失败: ' + (detailedError as Error).message,
                                    requestId: requestId
                                })
                                panelPort.disconnect()
                            } catch (error) {
                                console.error('发送详细数据错误失败: ', error)
                            }
                        }
                    }
                } else {
                    sendResponse({
                        type: 'error',
                        error: '获取页面数据失败: ' + ((response as any)?.error || '未知错误')
                    })
                }
            } catch (error) {
                console.error('DOM 分析过程中出错，错误详情: ', {
                    message: (error as Error).message,
                    stack: (error as Error).stack,
                    tabId: tabId,
                    timestamp: new Date().toISOString()
                })
                
                let errorMessage = 'DOM 分析失败: ' + (error as Error).message
                sendResponse({
                    type: 'error',
                    error: errorMessage
                })
            }
            return
        } else {
            // 直接进行正常对话
            try {
                const apiKey = await getApiKeyFromStorage()
                const aiClient = new DoubaoAIClient(apiKey)
                
                // 创建 AbortController 用于中断请求
                currentAbortController = new AbortController()
                
                const normalChatPrompt = `
你是一个专业的 AI 开发者助手，擅长回答各种技术问题。

用户问题：${question}

请直接、准确地回答用户的问题。如果问题涉及编程、技术概念、最佳实践等，请提供详细和有用的回答。`
                const messages: ChatMessage[] = [
                    {
                        role: 'system',
                        content: '你是一个专业的 AI 开发者助手，擅长回答各种技术问题，提供准确、详细和有用的回答。'
                    },
                    {
                        role: 'user',
                        content: normalChatPrompt
                    }
                ]

                // 发送开始响应
                if (panelPort) {
                    try {
                        panelPort.postMessage({ 
                            type: 'started',
                            requestId: requestId
                        })
                    } catch (error) {
                        console.error('发送开始消息失败: ', error)
                        panelPort = null
                        return
                    }
                } else {
                    return
                }

                // 调用 AI 流式 API
                let isFirstChunk = true
                await aiClient.sendMessageStream(
                    messages,
                    // onChunk - 处理流式数据块
                    (chunk: string) => {
                        if (panelPort) {
                            try {
                                panelPort.postMessage({
                                    type: 'streaming_content',
                                    content: chunk,
                                    isFirstChunk,
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
                                    type: 'streaming_complete',
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
                                    type: 'error',
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
                console.error('处理正常对话时出错: ', error)
                if (panelPort) {
                    try {
                        panelPort.postMessage({
                            type: 'error',
                            error: '处理问题时出错: ' + (error as Error).message,
                            requestId: requestId
                        })
                        panelPort.disconnect()
                    } catch (sendError) {
                        console.error('发送错误消息失败: ', sendError)
                    }
                    panelPort = null
                }
            }
            return
        }
    } catch (error) {
        console.error('处理问题时出错: ', error)
        sendResponse({
            success: false,
            error: error instanceof Error ? error.message : '处理问题时出现未知错误'
        })
    }
}

// 构建 AI 提示词
function buildAIPrompt(question: string, pageData: any): string {
    if (!pageData) return ''
    
    let prompt = `页面分析结果：\n\n`
    
    // 添加页面基本信息
    if (pageData.pageInfo) {
        prompt += `页面基本信息：\n`
        prompt += `- 标题: ${pageData.pageInfo.title || '未知'}\n`
        prompt += `- URL: ${pageData.pageInfo.url || '未知'}\n`
        prompt += `- 分析时间: ${pageData.pageInfo.timestamp || '未知'}\n\n`
    }
    
    // 添加 DOM 结构信息
    if (pageData.domStructure) {
        prompt += `DOM 结构信息：\n`
        prompt += `- 总元素数量: ${pageData.domStructure.totalElements || 0}\n`
        if (pageData.domStructure.semanticInfo) {
            prompt += `- 页面结构: `
            const structures = []
            if (pageData.domStructure.semanticInfo.hasHeader) structures.push('header')
            if (pageData.domStructure.semanticInfo.hasNav) structures.push('nav')
            if (pageData.domStructure.semanticInfo.hasMain) structures.push('main')
            if (pageData.domStructure.semanticInfo.hasFooter) structures.push('footer')
            if (pageData.domStructure.semanticInfo.hasSection) structures.push('section')
            if (pageData.domStructure.semanticInfo.hasArticle) structures.push('article')
            if (pageData.domStructure.semanticInfo.hasAside) structures.push('aside')
            prompt += structures.join(', ') + '\n'
            
            if (pageData.domStructure.semanticInfo.headingStructure && pageData.domStructure.semanticInfo.headingStructure.length > 0) {
                prompt += `- 标题结构: `
                const headings = pageData.domStructure.semanticInfo.headingStructure.map((h: any) => `H${h.level}: ${h.text}`).join(', ')
                prompt += headings + '\n'
            }
        }
        prompt += '\n'
    }
    
    if (pageData.pageHTML && pageData.pageHTML.html) {
        prompt += `页面 HTML 内容：\n`
        prompt += '```\n'
        const htmlContent = pageData.pageHTML.html
        const maxLength = 3000
        if (htmlContent.length > maxLength) {
            prompt += htmlContent.substring(0, maxLength) + '\n... (内容已截断，完整 HTML 过长)\n'
        } else {
            prompt += htmlContent + '\n'
        }
        prompt += '```\n\n'
    }
    
    if (pageData.semanticAnalysis) {
        prompt += `语义化分析：\n`
        const semantic = pageData.semanticAnalysis
        prompt += `- Header 元素: ${semantic.hasHeader ? '存在' : '不存在'}\n`
        prompt += `- Nav 元素: ${semantic.hasNav ? '存在' : '不存在'}\n`
        prompt += `- Main 元素: ${semantic.hasMain ? '存在' : '不存在'}\n`
        prompt += `- Footer 元素: ${semantic.hasFooter ? '存在' : '不存在'}\n`
        prompt += `- Section 元素: ${semantic.hasSection ? '存在' : '不存在'}\n`
        prompt += `- Article 元素: ${semantic.hasArticle ? '存在' : '不存在'}\n`
        prompt += `- Aside 元素: ${semantic.hasAside ? '存在' : '不存在'}\n`
        
        if (semantic.headingStructure && semantic.headingStructure.length > 0) {
            prompt += `- 标题层级: ${semantic.headingStructure.map((h: any) => `H${h.level}`).join(', ')}\n`
        }
        prompt += '\n'
    }
    
    prompt += `用户问题: ${question}\n\n`
    prompt += `请基于以上页面的完整 HTML 内容和分析信息，详细回答用户的问题。`
    prompt += `如果问题涉及页面结构、元素定位、样式分析等，请结合具体的 HTML 代码进行说明。`
    
    return prompt
}

// 保留简单的关键词匹配作为后备方案
function containsDOMKeywords(question: string): boolean {
    const keywords = [
        'dom', 'html', '结构', '页面', '元素', '标签', '语义化',
        'semantic', 'structure', 'element', 'tag', 'markup',
        '布局', 'layout', '文档', 'document', '树', 'tree'
    ]
    
    const lowerQuestion = question.toLowerCase()
    return keywords.some(keyword => lowerQuestion.includes(keyword))
}

// 智能判断是否需要 DOM 分析
async function shouldUseDOMAnalysis(question: string): Promise<{ shouldAnalyze: boolean; reasoning: string }> {
    try {
        // 使用关键词匹配作为快速判断
        const keywords = ['dom', 'html', '结构', '页面', '元素', '标签', '语义化'];
        const lowerQuestion = question.toLowerCase();
        const hasKeyword = keywords.some(keyword => lowerQuestion.includes(keyword));
        
        if (hasKeyword) {
            return {
                shouldAnalyze: true,
                reasoning: '关键词匹配检测到 DOM 相关需求'
            };
        }

        const apiKey = await getApiKeyFromStorage()
        if (!apiKey || apiKey.trim() === '') {
            return {
                shouldAnalyze: containsDOMKeywords(question),
                reasoning: 'API 密钥未配置，使用关键词匹配'
            };
        }

        const aiClient = new DoubaoAIClient(apiKey)
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: `你是一个智能助手，专门判断用户问题是否需要分析页面 DOM 结构。

判断标准：
1. 问题涉及页面结构、元素查找、样式分析
2. 问题涉及 HTML 语义化、可访问性
3. 问题涉及页面布局、组件定位
4. 问题需要具体页面信息才能准确回答

不需要 DOM 分析的情况：
1. 纯理论问题
2. 代码编写问题
3. 配置问题
4. 通用技术问题

请返回 JSON 格式：
{
    "shouldAnalyze": true/false,
    "reasoning": "判断理由"
}`
            },
            {
                role: 'user',
                content: `请判断以下问题是否需要分析页面 DOM 结构：

问题：${question}

请仔细分析问题的意图，判断是否需要获取当前页面的具体 DOM 信息才能提供准确答案。`
            }
        ]

        // 调用 AI 进行判断
        const response = await aiClient.sendMessage(messages)
        try {
            const result = JSON.parse(response.choices[0].message.content)
            return {
                shouldAnalyze: result.shouldAnalyze || false,
                reasoning: result.reasoning || 'AI 判断结果'
            }
        } catch (parseError) {
            // 如果 JSON 解析失败，使用关键词匹配作为后备
            console.warn('AI 判断结果解析失败，使用关键词匹配后备方案')
            return {
                shouldAnalyze: containsDOMKeywords(question),
                reasoning: '关键词匹配后备方案'
            }
        }
    } catch (error) {
        console.error('AI 判断失败，使用关键词匹配后备方案: ', error)
        return {
            shouldAnalyze: containsDOMKeywords(question),
            reasoning: '关键词匹配后备方案'
        }
    }
}