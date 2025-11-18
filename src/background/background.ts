// 监听来自 DevTools Panel 和 Content Script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ASK_QUESTION') {
        handleQuestion(request.question, sendResponse)
        return true
    } else if (request.type === 'GET_TAB_INFO') {
        handleTabInfo(sender.tab?.id, sendResponse)
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

async function handleQuestion(question: string, sendResponse: (response: any) => void) {
    try {
        const answer = `这是对问题"${question}"的模拟回答。实际将调用 AI API。`
        sendResponse({ answer })
    } catch (error) {
        console.error('处理问题失败: ', error)
        sendResponse({ error: '处理请求时发生错误' })
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