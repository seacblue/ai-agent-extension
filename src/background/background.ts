// 存储当前活跃的定时器和 AI 客户端
let activeTimers: NodeJS.Timeout[] = []
let currentAIProcess: { abort: () => void } | null = null

// 导入 AI 客户端
import { DoubaoAIClient, ChatMessage } from './ai-client'
import { getApiKeyFromStorage, saveApiKey } from '../config/api'

// 监听来自 DevTools Panel 和 Content Script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ASK_QUESTION') {
        handleQuestion(request.question, sendResponse)
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

// 监听来自 Content Script 的长连接
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'content-script') {
        port.onMessage.addListener((message) => {
            if (message.type === 'PAGE_ANALYSIS') {
                console.log('页面分析结果: ', message.data)
                // 可以在这里处理页面分析数据
                // 比如发送到 DevTools Panel
            }
        })
    }
})

// 处理来自 DevTools Panel 的问题
async function handleQuestion(question: string, sendResponse: (response: any) => void) {
    try {
        // 获取 API 密钥
        const apiKey = await getApiKeyFromStorage()
        
        /*
        if (!apiKey || apiKey.trim().length === 0) {
            sendResponse({
                type: 'error',
                error: 'API 密钥不能为空',
                status: 'error'
            })
            return
        }
        */

        // 创建 AI 客户端
        const aiClient = new DoubaoAIClient(apiKey)
        
        // 构建消息
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: '你是一个智能助手，专门帮助用户解答问题和提供建议。请用简洁明了的方式回答用户的问题。'
            },
            {
                role: 'user',
                content: question
            }
        ]

        // 创建可中断的进程对象
        let isAborted = false
        currentAIProcess = {
            abort: () => {
                isAborted = true
            }
        }

        // 立即返回响应表示处理开始
        sendResponse({
            type: 'started',
            content: '开始处理...',
            status: 'processing'
        })

        // 使用流式 API 调用
        let fullContent = ''
        let isFirstChunk = true
        await aiClient.sendMessageStream(
            messages,
            (chunk: string) => {
                if (isAborted) return
                
                // 累积内容
                fullContent += chunk
                
                // 发送流式内容，包含累积的完整内容
                chrome.runtime.sendMessage({
                    type: 'streaming_content',
                    content: fullContent,
                    chunk: chunk,
                    isFirstChunk: isFirstChunk
                })
                
                isFirstChunk = false
            },
            () => {
                if (isAborted) return
                
                // 流式传输完成，发送完整内容作为最终答案
                chrome.runtime.sendMessage({
                    type: 'streaming_complete',
                    answer: fullContent,
                    status: 'success'
                })
                currentAIProcess = null
            },
            (error: Error) => {
                if (isAborted) return
                
                console.error('豆包 AI API 调用失败: ', error)
                chrome.runtime.sendMessage({
                    type: 'error',
                    error: `${error.message}`,
                    status: 'error'
                })
                currentAIProcess = null
            }
        )
    } catch (error) {
        console.error('处理问题失败: ', error)
        sendResponse({ 
            type: 'error',
            error: '处理请求时发生错误: ' + (error as Error).message,
            status: 'error'
        })
        currentAIProcess = null
    }
}

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
        activeTimers.forEach(timer => {
            clearTimeout(timer)
        })
        
        // 中断当前 AI 进程
        if (currentAIProcess) {
            currentAIProcess.abort()
            currentAIProcess = null
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