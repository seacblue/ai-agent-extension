import { registerAllTools, toolManager } from "../tools";
registerAllTools()

// 监听来自 DevTools Panel 的消息
chrome.runtime.onMessage.addListener(async (request, _sender, sendResponse) => {
    console.log('Content Script 收到消息:', request.type, request)
    
    if (request.type === 'INIT_CONNECTION') {
        // 响应 Background 的连接初始化请求
        console.log('收到 Background 连接初始化请求')
        if (!connectionEstablished) {
            connectToBackground()
        }
        sendResponse({ type: 'connection_initiated', success: true })
        return true
    } else if (request.type === 'EXECUTE_TOOLS') {
        try {
            const { keywords, params, context, requestId } = request;
            
            console.log('CONTENT 已经收到 EXECUTE_TOOLS 信号, request =', request)
            
            // 检查是否需要长连接响应
            const needsLongConnection = keywords.some((keyword: string) => 
                ['getDOM', 'cssAnalyzer'].includes(keyword)
            )
            
            if (needsLongConnection && requestId) {
                // 立即返回处理中状态
                sendResponse({
                    type: 'processing',
                    requestId: requestId
                })
                
                // 异步执行工具并通过长连接返回结果
                executeToolsWithLongConnection(keywords, params, context, requestId)
                return true
            } else {
                // 直接执行并返回结果
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
            }
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
        console.log('Content Script 收到未知消息类型: ', request.type)
        return false
    }
})

// 通过长连接执行工具并返回结果
async function executeToolsWithLongConnection(
    keywords: string[], 
    params: any, 
    context: any, 
    requestId: string
) {
    try {
        const results = await toolManager.executeToolsByKeywords(
            keywords || [],
            params || {},
            context || {}
        );

        // 确定连接名称
        let connectionName = 'tool-analysis-result'
        if (keywords.includes('getDOM')) {
            connectionName = 'dom-analysis-result'
        } else if (keywords.includes('cssAnalyzer')) {
            connectionName = 'css-analysis-result'
        }

        // 建立长连接并返回结果
        const port = chrome.runtime.connect({ name: connectionName })
        
        port.postMessage({
            type: connectionName.toUpperCase().replace('-', '_'),
            requestId: requestId,
            success: true,
            data: {
                type: 'TOOLS_EXECUTION_RESULT',
                success: true,
                results
            }
        })
        
        // 短暂延迟后断开连接
        setTimeout(() => {
            port.disconnect()
        }, 1000)
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('长连接工具执行失败: ', error);
        
        // 确定连接名称
        let connectionName = 'tool-analysis-result'
        if (keywords.includes('getDOM')) {
            connectionName = 'dom-analysis-result'
        } else if (keywords.includes('cssAnalyzer')) {
            connectionName = 'css-analysis-result'
        }
        
        // 建立长连接并返回错误
        const port = chrome.runtime.connect({ name: connectionName })
        
        port.postMessage({
            type: connectionName.toUpperCase().replace('-', '_'),
            requestId: requestId,
            success: false,
            error: errorMessage
        })
        
        // 短暂延迟后断开连接
        setTimeout(() => {
            port.disconnect()
        }, 1000)
    }
}

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

// 元素选择器功能
let isSelectingElement = false
let elementOverlay: HTMLDivElement | null = null
let selectedElement: Element | null = null

// 处理来自 Background 的元素选择器消息
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.type === 'START_ELEMENT_SELECTOR') {
        startElementSelector()
        sendResponse({ type: 'success', message: '元素选择器已启动' })
        return true
    } else if (request.type === 'STOP_ELEMENT_SELECTOR') {
        stopElementSelector()
        sendResponse({ type: 'success', message: '元素选择器已停止' })
        return true
    }
    return false
})

// 启动元素选择器
function startElementSelector() {
    if (isSelectingElement) {
        console.log('元素选择器已在运行中')
        return
    }
    
    isSelectingElement = true
    console.log('启动元素选择器')
    
    // 创建高亮覆盖层
    createHighlightOverlay()
    
    // 添加事件监听器（使用 capture 阶段确保优先级）
    document.addEventListener('mouseover', handleMouseOver, true)
    document.addEventListener('mouseout', handleMouseOut, true)
    document.addEventListener('click', handleClick, true)
    // 添加右键事件监听（使用 capture 阶段确保优先级）
    document.addEventListener('contextmenu', handleContextMenu, true)
    
    // 添加更多事件监听器以完全阻止元素交互
    document.addEventListener('mousedown', handleMouseDown, true)
    document.addEventListener('mouseup', handleMouseUp, true)
    document.addEventListener('dblclick', handleDoubleClick, true)
    
    // 阻止所有键盘事件
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp, true)
    document.addEventListener('keypress', handleKeyPress, true)
    
    // 阻止焦点事件
    document.addEventListener('focus', handleFocus, true)
    document.addEventListener('blur', handleBlur, true)
    
    // 更改鼠标样式
    document.body.style.cursor = 'crosshair'
    console.log('设置鼠标样式为 crosshair')
    
    // 显示提示信息
    showSelectionTooltip()
    console.log('显示选择提示')
}

// 停止元素选择器
function stopElementSelector() {
    if (!isSelectingElement) {
        return
    }
    
    isSelectingElement = false
    console.log('停止元素选择器')
    
    // 移除覆盖层
    removeHighlightOverlay()
    
    // 移除事件监听器
    document.removeEventListener('mouseover', handleMouseOver, true)
    document.removeEventListener('mouseout', handleMouseOut, true)
    document.removeEventListener('click', handleClick, true)
    document.removeEventListener('contextmenu', handleContextMenu, true)
    
    // 移除额外的事件监听器
    document.removeEventListener('mousedown', handleMouseDown, true)
    document.removeEventListener('mouseup', handleMouseUp, true)
    document.removeEventListener('dblclick', handleDoubleClick, true)
    document.removeEventListener('keydown', handleKeyDown, true)
    document.removeEventListener('keyup', handleKeyUp, true)
    document.removeEventListener('keypress', handleKeyPress, true)
    document.removeEventListener('focus', handleFocus, true)
    document.removeEventListener('blur', handleBlur, true)
    
    // 恢复鼠标样式
    document.body.style.cursor = ''
    
    // 移除提示信息
    hideSelectionTooltip()
}

// 创建高亮覆盖层
function createHighlightOverlay() {
    console.log('创建高亮覆盖层')
    elementOverlay = document.createElement('div')
    elementOverlay.style.cssText = `
        position: absolute;
        pointer-events: none;
        border: 2px solid #007bff;
        background-color: rgba(0, 123, 255, 0.1);
        z-index: 999999;
        transition: all 0.1s ease;
        box-shadow: 0 0 0 1px rgba(0, 123, 255, 0.3);
    `
    document.body.appendChild(elementOverlay)
    console.log('高亮覆盖层已添加到页面')
}

// 移除高亮覆盖层
function removeHighlightOverlay() {
    if (elementOverlay) {
        elementOverlay.remove()
        elementOverlay = null
    }
}

// 处理鼠标悬停
function handleMouseOver(event: MouseEvent) {
    if (!isSelectingElement || !elementOverlay) return
    
    let target = event.target as Element
    
    // 确保我们能够选择任何元素，包括禁用的元素
    // 不再需要特殊查找disabled元素，直接使用当前target
    // 因为我们在capture阶段处理，所以可以获取到所有元素
    
    // 如果目标元素是文本节点或其他非元素节点，获取其父元素
    if (target.nodeType === Node.TEXT_NODE || target.nodeType === Node.COMMENT_NODE) {
        target = target.parentElement || target
    }
    
    const rect = target.getBoundingClientRect()
    
    console.log('鼠标悬停在元素上: ', target.tagName, target, rect)
    
    elementOverlay.style.display = 'block'
    elementOverlay.style.top = `${rect.top + window.scrollY}px`
    elementOverlay.style.left = `${rect.left + window.scrollX}px`
    elementOverlay.style.width = `${rect.width}px`
    elementOverlay.style.height = `${rect.height}px`
    
    console.log('高亮覆盖层位置和尺寸设置完成')
}

// 处理鼠标移出
function handleMouseOut(event: MouseEvent) {
    if (!isSelectingElement || !elementOverlay) return
    
    // 检查是否真的移出了元素
    const relatedTarget = event.relatedTarget as Element
    if (!relatedTarget || !elementOverlay.contains(relatedTarget)) {
        elementOverlay.style.display = 'none'
    }
}

// 处理点击事件
function handleClick(event: MouseEvent) {
    if (!isSelectingElement) return
    
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    
    // 获取实际点击的元素，确保能选择任何元素
    let target = event.target as Element
    
    // 如果目标元素是文本节点或其他非元素节点，获取其父元素
    if (target.nodeType === Node.TEXT_NODE || target.nodeType === Node.COMMENT_NODE) {
        target = target.parentElement || target
    }
    
    // 确保我们选择的是元素节点
    if (target.nodeType !== Node.ELEMENT_NODE) {
        console.warn('目标不是元素节点，跳过选择')
        return
    }
    
    selectedElement = target
    
    // 获取元素信息
    const elementInfo = getElementInfo(selectedElement)
    
    console.log('元素已选择，准备发送到 Panel: ', elementInfo)
    
    // 直接向 Panel 发送元素选择结果
    chrome.runtime.sendMessage({
        type: 'ELEMENT_SELECTED_RESULT',
        elementData: elementInfo,
        requestId: `element-selected-${Date.now()}`
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('发送元素选择结果到 Panel 失败:', chrome.runtime.lastError.message)
        } else {
            console.log('元素选择结果已发送到 Panel: ', response)
        }
    })
    
    // 停止选择器
    stopElementSelector()
    
    console.log('已选择元素: ', selectedElement, elementInfo)
}

// 处理鼠标按下事件
function handleMouseDown(event: MouseEvent) {
    if (!isSelectingElement) return
    
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    console.log('阻止了鼠标按下事件')
}

// 处理鼠标释放事件
function handleMouseUp(event: MouseEvent) {
    if (!isSelectingElement) return
    
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    console.log('阻止了鼠标释放事件')
}

// 处理双击事件
function handleDoubleClick(event: MouseEvent) {
    if (!isSelectingElement) return
    
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    console.log('阻止了双击事件')
}

// 处理键盘按下事件
function handleKeyDown(event: KeyboardEvent) {
    if (!isSelectingElement) return
    
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    console.log('阻止了键盘按下事件')
}

// 处理键盘释放事件
function handleKeyUp(event: KeyboardEvent) {
    if (!isSelectingElement) return
    
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    console.log('阻止了键盘释放事件')
}

// 处理键盘按键事件
function handleKeyPress(event: KeyboardEvent) {
    if (!isSelectingElement) return
    
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    console.log('阻止了键盘按键事件')
}

// 处理焦点事件
function handleFocus(event: FocusEvent) {
    if (!isSelectingElement) return
    
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    console.log('阻止了焦点事件')
}

// 处理失焦事件
function handleBlur(event: FocusEvent) {
    if (!isSelectingElement) return
    
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    console.log('阻止了失焦事件')
}

// 处理右键事件
function handleContextMenu(event: MouseEvent) {
    if (!isSelectingElement) return
    
    // 阻止默认的右键菜单
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    
    stopElementSelector()
    console.log('用户右键取消元素选择')
}

// 获取元素信息
function getElementInfo(element: Element) {
    const computedStyle = window.getComputedStyle(element)
    
    // 获取元素的位置和尺寸信息
    const rect = element.getBoundingClientRect()
    
    // 获取 CSS 属性
    const cssProperties = {
        // 布局属性
        display: computedStyle.display,
        position: computedStyle.position,
        width: computedStyle.width,
        height: computedStyle.height,
        margin: computedStyle.margin,
        padding: computedStyle.padding,
        
        // 盒模型属性
        borderTop: computedStyle.borderTop,
        borderLeft: computedStyle.borderLeft,
        borderRight: computedStyle.borderRight,
        borderBottom: computedStyle.borderBottom,
        
        // Flexbox 属性
        flexDirection: computedStyle.flexDirection,
        justifyContent: computedStyle.justifyContent,
        alignItems: computedStyle.alignItems,
        flexWrap: computedStyle.flexWrap,
        
        // Grid 属性
        displayGrid: computedStyle.display === 'grid',
        gridTemplateColumns: computedStyle.gridTemplateColumns,
        gridTemplateRows: computedStyle.gridTemplateRows,
        
        // 定位属性
        top: computedStyle.top,
        left: computedStyle.left,
        right: computedStyle.right,
        bottom: computedStyle.bottom,
        zIndex: computedStyle.zIndex,
        
        // 其他重要属性
        backgroundColor: computedStyle.backgroundColor,
        color: computedStyle.color,
        fontSize: computedStyle.fontSize,
        fontFamily: computedStyle.fontFamily,
        textAlign: computedStyle.textAlign,
        lineHeight: computedStyle.lineHeight
    }
    
    return {
        // 基本信息
        tagName: element.tagName.toLowerCase(),
        id: element.id || '',
        className: element.className || '',
        
        // HTML 结构
        outerHTML: element.outerHTML,
        innerHTML: element.innerHTML,
        textContent: element.textContent || '',
        
        // 位置和尺寸
        rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom
        },
        
        // CSS 属性
        css: cssProperties,
        
        // 元素路径
        xpath: getXPath(element),
        cssSelector: getCssSelector(element),
        
        // 父子关系
        parent: element.parentElement ? {
            tagName: element.parentElement.tagName.toLowerCase(),
            className: element.parentElement.className || '',
            id: element.parentElement.id || ''
        } : null,
        
        children: Array.from(element.children).map(child => ({
            tagName: child.tagName.toLowerCase(),
            className: child.className || '',
            id: child.id || ''
        }))
    }
}

// 获取元素的 XPath
function getXPath(element: Element): string {
    if (!element) return ''
    
    if (element.id) {
        return `//*[@id="${element.id}"]`
    }
    
    const parts: string[] = []
    let current = element
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
        let index = 0
        let sibling = current.previousSibling
        
        while (sibling) {
            if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
                index++
            }
            sibling = sibling.previousSibling
        }
        
        const tagName = current.nodeName.toLowerCase()
        const pathIndex = index > 0 ? `[${index + 1}]` : ''
        parts.unshift(`${tagName}${pathIndex}`)
        
        current = current.parentElement as Element
    }
    
    return parts.length ? `/${parts.join('/')}` : ''
}

// 获取元素的 CSS 选择器
function getCssSelector(element: Element): string {
    if (!element) return ''
    
    if (element.id) {
        return `#${element.id}`
    }
    
    const path: string[] = []
    let current = element
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.nodeName.toLowerCase()
        
        if (current.className) {
            const classes = current.className.split(' ').filter(c => c.trim())
            if (classes.length > 0) {
                selector += '.' + classes.join('.')
            }
        }
        
        path.unshift(selector)
        current = current.parentElement as Element
        
        // 限制路径深度
        if (path.length > 5) break
    }
    
    return path.join(' > ')
}

// 显示选择提示
function showSelectionTooltip() {
    const tooltip = document.createElement('div')
    tooltip.id = 'element-selector-tooltip'
    tooltip.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #007bff;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        z-index: 1000000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        pointer-events: none;
        text-align: center;
        animation: fadeIn 0.3s ease;
    `
    tooltip.innerHTML = `
        <div>点击选择要分析的元素</div>
        <div style="font-size: 12px; margin-top: 4px; opacity: 0.9;">单击右键取消选择</div>
    `
    
    // 添加动画样式
    const style = document.createElement('style')
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `
    document.head.appendChild(style)
    
    document.body.appendChild(tooltip)
}

// 隐藏选择提示
function hideSelectionTooltip() {
    const tooltip = document.getElementById('element-selector-tooltip')
    if (tooltip) {
        tooltip.remove()
    }
}
