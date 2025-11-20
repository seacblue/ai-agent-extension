import { Tool, ToolResult, ToolContext } from './types';

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

// DOM 工具实现
class DOMTool implements Tool {
    name = 'getDOM';
    description = '获取页面 DOM 结构、HTML 内容和语义化分析';
    keywords = ['DOM', '结构', 'HTML', '页面', '元素', '标签', '文档', 'document', 'element'];

    async execute(params: any = {}, context?: ToolContext): Promise<ToolResult> {
        try {
            const startTime = Date.now();
            
            // 并行获取所有数据
            const [domStructure, pageHTML, semanticAnalysis] = await Promise.allSettled([
                this.getDOMStructure(params.domOptions),
                this.getPageHTML(params.htmlOptions),
                this.analyzeSemantics()
            ]);

            const pageData = {
                pageInfo: this.createPageInfo(),
                domStructure: domStructure.status === 'fulfilled' ? domStructure.value : null,
                pageHTML: pageHTML.status === 'fulfilled' ? pageHTML.value : null,
                semanticAnalysis: semanticAnalysis.status === 'fulfilled' ? semanticAnalysis.value : null,
                timestamp: new Date().toISOString(),
                executionContext: context
            };

            return {
                success: true,
                data: pageData,
                toolName: this.name,
                executionTime: Date.now() - startTime
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                toolName: this.name,
                executionTime: 0
            };
        }
    }

    // 创建页面信息
    private createPageInfo(): PageInfo {
        return {
            title: document.title,
            url: window.location.href,
            timestamp: new Date().toISOString()
        };
    }

    // DOM 结构获取函数
    private async getDOMStructure(options: DOMOptions = {}): Promise<DOMStructure> {
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
    private async analyzeSemantics(): Promise<SemanticInfo> {
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

    // 获取页面 HTML 函数
    private async getPageHTML(options: HTMLOptions = {}): Promise<HTMLContent> {
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
}

// 导出 DOM 工具实例
export const domTool = new DOMTool();