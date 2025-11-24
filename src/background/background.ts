import { getApiKeyFromStorage, handleSetApiKey, handleGetApiKey, handleClearApiKey } from '../shared/services/api';
import { LongConnectionManager } from '../shared/services/longConnectionManager';
import { AIProcessService, TerminateOptions } from '../shared/services/aiProcess';

// 扩展启动或安装时获取并保持 API Key
chrome.runtime.onStartup.addListener(async () => {
    try {
        // 启动时获取 API Key，确保使用保存的值
        const apiKey = await getApiKeyFromStorage();
        console.log('扩展启动，获取 API Key 状态: ' + (apiKey ? '已配置' : '未配置'));
    } catch (error) {
        console.error('启动时获取 API Key 失败: ', error);
    }
});

// 监听来自 DevTools Panel 和 Content Script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ASK_QUESTION') {
        // 对于 ASK_QUESTION 请求，使用异步处理但立即返回成功，因为实际响应会通过长连接发送
        sendResponse({ type: 'processing', message: '问题处理中，通过长连接返回结果' })
        handleQuestion(request.question, request.requestId, sender, () => {})
        return false // 不需要保持通道开放，因为使用长连接进行异步通信
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

// 管理单个 Panel 连接
let panelPort: chrome.runtime.Port | null = null

// 监听来自 Content Script 的长连接
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'question-response') {
        // 处理 Panel 连接
        console.log('Panel 连接建立')
        
        // 如果已有连接，先断开旧连接
        if (panelPort) {
            try {
                panelPort.disconnect();
                console.log('断开旧的 Panel 连接')
            } catch (error) {
                console.error('断开旧连接失败:', error)
            }
        }
        
        panelPort = port
        
        port.onDisconnect.addListener(() => { 
            console.log('Panel 连接断开')
            panelPort = null
            
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
                    timestamp: new Date().toISOString()
                })
                console.log('发送连接确认成功')
            } else {
                console.warn('连接已断开，无法发送确认')
                panelPort = null
            }
        } catch (error) {
            console.error('发送 Panel 连接确认失败: ', error)
            panelPort = null
        }
    }
})

// 处理终止请求
function terminateTasks(options: TerminateOptions) {
    try {
        const aiProcessService = AIProcessService.getInstance();
        aiProcessService.terminateTasks(options);
        const connectionManager = LongConnectionManager.getInstance();
        connectionManager.cleanup();
    } catch (error) {
        console.error('终止任务失败: ', error);
        if (options.responseMethod === 'sendResponse' && options.sendResponse) {
            options.sendResponse({
                type: 'error',
                message: '终止任务失败: ' + (error as Error).message,
                status: 'error'
            });
        }
    }
}

async function handleQuestion(question: string, requestId: string, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    try {
        const aiProcessService = AIProcessService.getInstance();
        await aiProcessService.handleQuestion({
            question,
            requestId,
            sender,
            sendResponse,
            panelPort,
            getApiKeyFromStorage,
            LongConnectionManager
        });
    } catch (error) {
        console.error('调用 AIProcessService 处理问题失败: ', error);
        sendResponse({
            success: false,
            error: error instanceof Error ? error.message : '处理问题时出现未知错误'
        });
    }
}