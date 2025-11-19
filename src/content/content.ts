// DOM 相关类型定义
interface DOMOptions {
    includeStyles?: boolean;
    includeAttributes?: boolean;
    maxDepth?: number;
    selector?: string;
}

interface HTMLOptions {
    format?: boolean;
    includeDoctype?: boolean;
    selector?: string;
}

interface PageInfo {
    title: string;
    url: string;
    timestamp: string;
}

interface ElementStructure {
    tagName: string;
    textContent: string;
    attributes?: Record<string, string>;
    styles?: Record<string, string>;
    children: ElementStructure[];
}

interface SemanticInfo {
    hasHeader: boolean;
    hasNav: boolean;
    hasMain: boolean;
    hasFooter: boolean;
    hasSection: boolean;
    hasArticle: boolean;
    hasAside: boolean;
    headingStructure: Array<{
        level: number;
        text: string;
    }>;
}

interface DOMStructure {
    success: boolean;
    pageInfo: PageInfo;
    domStructure: ElementStructure;
    semanticInfo: SemanticInfo;
    totalElements: number;
    error?: string;
    stack?: string;
}

interface HTMLContent {
    success: boolean;
    html: string;
    pageInfo: PageInfo;
    error?: string;
}

// 创建页面信息
function createPageInfo(): PageInfo {
    return {
        title: document.title,
        url: window.location.href,
        timestamp: new Date().toISOString()
    }
}

// 创建页面分析
function createPageAnalysis() {
    return {
        pageInfo: createPageInfo(),
        elementCount: document.querySelectorAll('*').length,
        textContent: document.body?.textContent?.substring(0, 200) || '',
        hasImages: document.querySelectorAll('img').length > 0,
        hasLinks: document.querySelectorAll('a').length > 0,
        hasForms: document.querySelectorAll('form').length > 0
    }
}

// DOM 结构获取函数
async function getDOMStructure(options: DOMOptions = {}): Promise<DOMStructure> {
    try {
        const { includeStyles = false, includeAttributes = false, maxDepth = 10, selector } = options;
        
        // 递归获取元素结构
        function getElementStructure(element: Element, depth = 0): ElementStructure | null {
            if (depth > maxDepth) return null;
            
            const structure: ElementStructure = {
                tagName: element.tagName.toLowerCase(),
                textContent: element.textContent ? element.textContent.substring(0, 100) : '',
                children: []
            };
            
            // 添加属性信息
            if (includeAttributes) {
                structure.attributes = {};
                for (let attr of element.attributes) {
                    structure.attributes[attr.name] = attr.value;
                }
            }
            
            // 添加样式信息
            if (includeStyles) {
                const computedStyle = window.getComputedStyle(element);
                structure.styles = {
                    display: computedStyle.display,
                    position: computedStyle.position,
                    visibility: computedStyle.visibility,
                    opacity: computedStyle.opacity
                };
            }
            
            // 递归处理子元素
            for (let child of element.children) {
                const childStructure = getElementStructure(child, depth + 1);
                if (childStructure) {
                    structure.children.push(childStructure);
                }
            }
            
            return structure;
        }
      
        // 获取目标元素
        let targetElement: Element | null;
        if (selector) {
            targetElement = document.querySelector(selector);
            if (!targetElement) {
                throw new Error('Selector not found: ' + selector);
            }
        } else {
            targetElement = document.body || document.documentElement;
        }
    
        if (!targetElement) {
            throw new Error('No target element found');
        }
    
        // 获取页面基本信息
        const pageInfo: PageInfo = {
            title: document.title,
            url: window.location.href,
            timestamp: new Date().toISOString()
        };
    
        // 获取 DOM 结构
        const domStructure = getElementStructure(targetElement);
        if (!domStructure) {
            throw new Error('Failed to generate DOM structure');
        }
    
        // 获取语义化分析信息
        const semanticInfo: SemanticInfo = {
            hasHeader: !!document.querySelector('header'),
            hasNav: !!document.querySelector('nav'),
            hasMain: !!document.querySelector('main'),
            hasFooter: !!document.querySelector('footer'),
            hasSection: !!document.querySelector('section'),
            hasArticle: !!document.querySelector('article'),
            hasAside: !!document.querySelector('aside'),
            headingStructure: []
        };
    
        // 分析标题结构
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(heading => {
            semanticInfo.headingStructure.push({
                level: parseInt(heading.tagName.substring(1)),
                text: heading.textContent ? heading.textContent.substring(0, 50) : ''
            });
        });
    
        const result: DOMStructure = {
            success: true,
            pageInfo,
            domStructure,
            semanticInfo,
            totalElements: document.querySelectorAll('*').length
        };

        return result;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        return {
            success: false,
            pageInfo: {
                title: document.title,
                url: window.location.href,
                timestamp: new Date().toISOString()
            },
            domStructure: {} as ElementStructure,
            semanticInfo: {} as SemanticInfo,
            totalElements: 0,
            error: errorMessage,
            stack: errorStack
        };
    }
}

// 语义化分析函数
async function analyzeSemantics(): Promise<SemanticInfo> {
    try {
        const semanticInfo: SemanticInfo = {
            hasHeader: !!document.querySelector('header'),
            hasNav: !!document.querySelector('nav'),
            hasMain: !!document.querySelector('main'),
            hasFooter: !!document.querySelector('footer'),
            hasSection: !!document.querySelector('section'),
            hasArticle: !!document.querySelector('article'),
            hasAside: !!document.querySelector('aside'),
            headingStructure: []
        };
        
        // 分析标题结构
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(heading => {
            semanticInfo.headingStructure.push({
                level: parseInt(heading.tagName.substring(1)),
                text: heading.textContent ? heading.textContent.substring(0, 50) : ''
            });
        });
        
        return semanticInfo;
    } catch (error: unknown) {
        // 返回默认的语义化信息
        return {
            hasHeader: false,
            hasNav: false,
            hasMain: false,
            hasFooter: false,
            hasSection: false,
            hasArticle: false,
            hasAside: false,
            headingStructure: []
        };
    }
}

// 获取页面HTML函数
async function getPageHTML(options: HTMLOptions = {}): Promise<HTMLContent> {
    try {
        const { format = false, includeDoctype = false, selector } = options;
        
        let html: string;
        
        if (selector) {
            const element = document.querySelector(selector);
            if (!element) {
                throw new Error('Selector not found: ' + selector);
            }
            html = element.outerHTML;
        } else {
            html = document.documentElement.outerHTML;
        }
        
        if (format) {
            html = html
                .replace(/></g, '>\n<')
                .replace(/^\s+|\s+$/gm, '');
        }
        
        if (includeDoctype && document.doctype) {
            const doctype = `<!DOCTYPE ${document.doctype.name}>`;
            html = doctype + '\n' + html;
        }
        
        const result: HTMLContent = {
            success: true,
            html: html,
            pageInfo: {
                title: document.title,
                url: window.location.href,
                timestamp: new Date().toISOString()
            }
        };

        return result;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return {
            success: false,
            html: '',
            pageInfo: {
                title: document.title,
                url: window.location.href,
                timestamp: new Date().toISOString()
            },
            error: errorMessage
        };
    }
}

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
                        // 并行获取 DOM 结构、页面 HTML 和语义分析，但设置较短的超时
                        const analysisPromise = Promise.allSettled([
                            getDOMStructure({ maxDepth: 10, includeAttributes: true, includeStyles: false }),
                            getPageHTML({ format: false }),
                            analyzeSemantics()
                        ])
                        
                        // 设置分析超时
                        const timeoutPromise = new Promise((_, reject) => {
                            setTimeout(() => reject(new Error('DOM 分析超时')), 8000)
                        })
                        
                        const [domStructure, pageHTML, semanticAnalysis] = await Promise.race([analysisPromise, timeoutPromise]) as any

                        const pageData = {
                            pageInfo: createPageInfo(),
                            domStructure: domStructure.status === 'fulfilled' ? domStructure.value : null,
                            pageHTML: pageHTML.status === 'fulfilled' ? pageHTML.value : null,
                            semanticAnalysis: semanticAnalysis.status === 'fulfilled' ? semanticAnalysis.value : null,
                            timestamp: new Date().toISOString()
                        }

                        // 通过长连接发送数据
                        port.postMessage({
                            type: 'DOM_ANALYSIS_RESULT',
                            success: true,
                            pageData
                        })
                        
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

function connectToBackground() {
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

                // 清除超时定时器
                if (connectionTimeout) {
                    clearTimeout(connectionTimeout)
                    connectionTimeout = null
                }
                
                // 重置重试计数
                retryCount = 0
            }
        })
        
        // 监听连接断开事件
        port.onDisconnect.addListener(() => {
            console.log('Content Script 已丢失与 Background 的连接，断开原因: ', chrome.runtime.lastError?.message || '未知原因')
            
            // 清除超时定时器
            if (connectionTimeout) {
                clearTimeout(connectionTimeout)
                connectionTimeout = null
            }
            
            connectionEstablished = false
            port = null
            
            // 如果不是正常断开，则重试连接
            if (retryCount < maxRetries && chrome.runtime.lastError?.message !== '正常断开') {
                retryCount++
                console.log(`Retrying connection (${retryCount}/${maxRetries})`)
                setTimeout(connectToBackground, 2000) // 增加重试间隔到 2 秒
            } else if (retryCount >= maxRetries) {
                console.log('已达到最大重试次数，停止重试')
            }
        })
        
    } catch (error) {
        console.error('Content Script 已丢失与 Background 的连接: ', error)
        handleConnectionFailure(error)
    }
}

function handleConnectionFailure(error: any) {
    connectionEstablished = false
    port = null
    
    // 清除超时定时器
    if (connectionTimeout) {
        clearTimeout(connectionTimeout)
        connectionTimeout = null
    }
    
    if (retryCount < maxRetries) {
        retryCount++
        console.log(`连接失败，准备重试 (${retryCount}/${maxRetries}):`, error)
        setTimeout(connectToBackground, 2000)
    } else {
        console.log('已达到最大重试次数，停止重试')
    }
}

// 初始化连接
setTimeout(connectToBackground, 1000) // 延迟 1 秒连接，确保页面稳定

// 定期分析页面并发送数据
function analyzePage() {
    const pageInfo = createPageAnalysis()
    
    // 检查连接状态，如果未连接或连接未确认则跳过
    if (!port || !connectionEstablished) {
        // 静默跳过，不输出日志避免干扰
        return
    }
    
    try {
        // 发送页面信息到 Background Script
        port.postMessage({
            type: 'PAGE_ANALYSIS',
            data: pageInfo
        })
        console.log('页面分析数据已发送到 Background')
    } catch (error) {
        console.error('向 Background 发送分析数据时失败: ', error)
        // 尝试重新连接
        connectionEstablished = false
        port = null
        connectToBackground()
    }
}

// 页面加载完成后分析
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(analyzePage, 2000) // 页面加载完成后延迟 2 秒分析，确保连接已建立
    })
} else {
    setTimeout(analyzePage, 2000) // 页面已加载，延迟 2 秒分析
}

// 监听页面变化
let lastUrl = window.location.href
const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href
        setTimeout(analyzePage, 3000) // 页面变化后延迟 3 秒分析，确保连接稳定
    }
})

observer.observe(document.body, {
    childList: true,
    subtree: true
})