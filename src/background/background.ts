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

// 处理来自 DevTools Panel 的问题
async function handleQuestion(question: string, sendResponse: (response: any) => void) {
    try {
        // 模拟 AI 思考过程
        const thinkingSteps = [
            `分析用户问题: "${question}"`,
            '制定回答策略和搜索方案',
            '调用知识库搜索相关信息',
            '整理搜索结果并形成结构化回答',
            '优化回答内容，确保清晰易懂'
        ]

        // 生成最终回答
        const answer = `这是对问题"${question}"的详细回答。经过分析后，我为您提供以下解决方案：\n1. 首先理解问题的核心需求\n2. 分析可能的解决方案\n3. 提供具体的实施建议\n4. 给出相关的注意事项\n\n希望这个回答对您有帮助！`

        // 获取当前活动的 DevTools Panel
        chrome.runtime.getContexts({ contextTypes: ['DEVELOPER_TOOLS'] }, (contexts) => {
            if (contexts.length > 0) {
                // 分步骤发送思考过程，模拟真实的思考延迟
                setTimeout(() => {
                    chrome.runtime.sendMessage({
                        type: 'thinking',
                        content: thinkingSteps[0]
                    })
                }, 500)

                setTimeout(() => {
                    chrome.runtime.sendMessage({
                        type: 'thinking',
                        content: thinkingSteps[1]
                    })
                }, 1500)

                setTimeout(() => {
                    chrome.runtime.sendMessage({
                        type: 'thinking',
                        content: thinkingSteps[2]
                    })
                }, 2500)

                setTimeout(() => {
                    chrome.runtime.sendMessage({
                        type: 'thinking',
                        content: thinkingSteps[3]
                    })
                }, 3500)

                setTimeout(() => {
                    chrome.runtime.sendMessage({
                        type: 'thinking',
                        content: thinkingSteps[4]
                    })
                }, 4500)

                // 最后发送完整回答
                setTimeout(() => {
                    chrome.runtime.sendMessage({
                        type: 'answer',
                        answer,
                        status: 'success'
                    })
                }, 6000)
            }
        })

        // 立即返回一个响应表示处理开始
        sendResponse({
            type: 'started',
            message: '思考过程已开始',
            status: 'processing'
        })
    } catch (error) {
        console.error('处理问题失败: ', error)
        sendResponse({ 
            type: 'error',
            error: '处理请求时发生错误: ' + (error as Error).message,
            status: 'error'
        })
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