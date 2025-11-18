// 监听来自 DevTools Panel 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_DOM') {
        const domContent = document.documentElement.outerHTML
        sendResponse({ dom: domContent })
    } else if (request.action === 'GET_PAGE_INFO') {
        const pageInfo = {
            title: document.title,
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        }
        sendResponse(pageInfo)
    }
    return true
})

// 创建与 Background Script 的长连接
const port = chrome.runtime.connect({ name: 'content-script' })

// 定期分析页面并发送数据
function analyzePage() {
    const pageInfo = {
        title: document.title,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        elements: {
            total: document.querySelectorAll('*').length,
            images: document.querySelectorAll('img').length,
            links: document.querySelectorAll('a').length,
            scripts: document.querySelectorAll('script').length,
            styles: document.querySelectorAll('style, link[rel="stylesheet"]').length
        }
    }
    
    // 发送页面信息到 Background Script
    port.postMessage({
        type: 'PAGE_ANALYSIS',
        data: pageInfo
    })
}

// 页面加载完成后分析
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', analyzePage)
} else {
    analyzePage()
}

// 监听页面变化
let lastUrl = window.location.href
const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href
        setTimeout(analyzePage, 1000) // 延迟 1 秒分析新页面
    }
})

observer.observe(document.body, {
    childList: true,
    subtree: true
})