import { Tool, ToolResult } from './types';

// CSS 分析器相关类型定义
interface CSSAnalyzerOptions {
    selector?: string;
    elementId?: string;
    naturalQuery?: string;
    properties?: string[];
    includeAll?: boolean;
}

interface ElementInfo {
    element: Element;
    selector: string;
    tagName: string;
    id: string;
    className: string;
    textContent: string;
    xpath: string;
}

interface CSSProperty {
    property: string;
    value: string;
    priority: string;
}

interface CSSAnalysisResult {
    success: boolean;
    elementInfo: ElementInfo;
    computedStyle: CSSProperty[];
    naturalQueryResult?: {
        query: string;
        answer: string;
        property: string;
        value: string;
    };
    error?: string;
}

// CSS 属性映射表，用于自然语言查询
const CSS_PROPERTY_MAP: { [key: string]: string[] } = {
    'padding': ['padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
    'margin': ['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
    'border': ['border', 'border-width', 'border-style', 'border-color', 'border-radius'],
    'background': ['background', 'background-color', 'background-image', 'background-size', 'background-position'],
    'color': ['color', 'background-color'],
    'size': ['width', 'height', 'max-width', 'max-height', 'min-width', 'min-height'],
    'position': ['position', 'top', 'right', 'bottom', 'left', 'z-index'],
    'display': ['display', 'visibility', 'opacity'],
    'font': ['font', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height'],
    'text': ['text-align', 'text-decoration', 'text-transform', 'text-indent'],
    'flex': ['display', 'flex-direction', 'justify-content', 'align-items', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis'],
    'grid': ['display', 'grid-template-columns', 'grid-template-rows', 'grid-gap', 'grid-area']
};

// CSS 分析器工具实现
class CSSAnalyzerTool implements Tool {
    name = 'cssAnalyzer';
    description = 'CSS 样式分析工具，获取元素的计算样式并支持自然语言查询';
    keywords = ['CSS', '样式', 'computedStyle', '计算样式', '元素', '样式分析', 'padding', 'margin', 'color', 'size'];

    async execute(params: CSSAnalyzerOptions = {}): Promise<ToolResult> {
        try {
            const startTime = Date.now();
            
            // 获取目标元素
            const elementInfo = this.getTargetElement(params);
            if (!elementInfo) {
                return {
                    success: false,
                    error: '未找到目标元素',
                    toolName: this.name,
                    executionTime: Date.now() - startTime
                };
            }

            // 获取计算样式
            const computedStyle = this.getComputedStyle(elementInfo.element, params);
            
            // 处理自然语言查询
            let naturalQueryResult;
            if (params.naturalQuery) {
                naturalQueryResult = this.processNaturalQuery(params.naturalQuery, computedStyle);
            }

            const result: CSSAnalysisResult = {
                success: true,
                elementInfo,
                computedStyle,
                naturalQueryResult
            };

            return {
                success: true,
                data: result,
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

    // 获取目标元素
    private getTargetElement(params: CSSAnalyzerOptions): ElementInfo | null {
        let element: Element | null = null;
        let selector = '';

        try {
            // 优先使用选择器
            if (params.selector) {
                element = document.querySelector(params.selector);
                selector = params.selector;
            }
            // 其次使用元素 ID
            else if (params.elementId) {
                element = document.getElementById(params.elementId);
                selector = `#${params.elementId}`;
            }
            // 再次使用 targetElement（从 background 传递的参数）
            else if ((params as any).targetElement) {
                element = document.querySelector((params as any).targetElement);
                selector = (params as any).targetElement;
            }
            // 如果都没有，尝试获取当前选中的元素（如果有元素选择功能）
            else {
                // 这里可以集成元素选择器，暂时返回 body 作为默认
                element = document.body;
                selector = 'body';
            }

            if (!element) {
                console.warn('未找到目标元素，选择器: ', selector);
                return null;
            }

            return {
                element,
                selector,
                tagName: element.tagName.toLowerCase(),
                id: element.id || '',
                className: element.className || '',
                textContent: element.textContent?.substring(0, 100) || '',
                xpath: this.getXPath(element)
            };

        } catch (error) {
            console.error('获取目标元素失败:', error);
            return null;
        }
    }

    // 获取元素的计算样式
    private getComputedStyle(element: Element, params: CSSAnalyzerOptions): CSSProperty[] {
        const computedStyle = window.getComputedStyle(element);
        const properties: CSSProperty[] = [];

        try {
            // 如果指定了特定属性，只返回这些属性
            if (params.properties && params.properties.length > 0) {
                params.properties.forEach(prop => {
                    const value = computedStyle.getPropertyValue(prop);
                    const priority = computedStyle.getPropertyPriority(prop);
                    properties.push({
                        property: prop,
                        value: value.trim(),
                        priority
                    });
                });
            } else if (params.includeAll) {
                // 返回所有 CSS 属性
                for (let i = 0; i < computedStyle.length; i++) {
                    const prop = computedStyle[i];
                    const value = computedStyle.getPropertyValue(prop);
                    const priority = computedStyle.getPropertyPriority(prop);
                    properties.push({
                        property: prop,
                        value: value.trim(),
                        priority
                    });
                }
            } else {
                // 返回常用的 CSS 属性
                const commonProperties = [
                    'display', 'position', 'width', 'height', 'margin', 'padding', 'border',
                    'background', 'color', 'font-size', 'font-family', 'text-align',
                    'flex-direction', 'justify-content', 'align-items', 'grid-template-columns'
                ];
                
                commonProperties.forEach(prop => {
                    const value = computedStyle.getPropertyValue(prop);
                    const priority = computedStyle.getPropertyPriority(prop);
                    if (value && value !== 'auto' && value !== 'normal') {
                        properties.push({
                            property: prop,
                            value: value.trim(),
                            priority
                        });
                    }
                });
            }
        } catch (error) {
            console.error('获取计算样式失败: ', error);
        }

        return properties;
    }

    // 处理自然语言查询
    private processNaturalQuery(query: string, computedStyle: CSSProperty[]): any {
        const lowerQuery = query.toLowerCase();
        
        // 查找匹配的 CSS 属性
        for (const [key, properties] of Object.entries(CSS_PROPERTY_MAP)) {
            if (lowerQuery.includes(key)) {
                for (const prop of properties) {
                    const cssProp = computedStyle.find(p => p.property === prop);
                    if (cssProp && cssProp.value) {
                        return {
                            query,
                            answer: `元素的 ${prop} 属性值是 ${cssProp.value}`,
                            property: prop,
                            value: cssProp.value
                        };
                    }
                }
            }
        }

        // 直接属性名匹配
        const directMatch = computedStyle.find(p => 
            lowerQuery.includes(p.property.replace(/-/g, ' '))
        );
        
        if (directMatch) {
            return {
                query,
                answer: `元素的 ${directMatch.property} 属性值是 ${directMatch.value}`,
                property: directMatch.property,
                value: directMatch.value
            };
        }

        return {
            query,
            answer: '抱歉，我没有找到匹配的CSS属性。请尝试更具体的查询，如"padding"、"margin"、"color"等。',
            property: '',
            value: ''
        };
    }

    // 获取元素的 XPath
    private getXPath(element: Element): string {
        if (!element) return '';
        
        const parts: string[] = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
            let index = 0;
            let sibling = element.previousSibling;
            
            while (sibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === element.nodeName) {
                    index++;
                }
                sibling = sibling.previousSibling;
            }
            
            const tagName = element.nodeName.toLowerCase();
            const pathIndex = index > 0 ? `[${index + 1}]` : '';
            parts.unshift(`${tagName}${pathIndex}`);
            
            element = element.parentNode as Element;
        }
        
        return parts.length ? '/' + parts.join('/') : '';
    }
}

// 导出 CSS 分析器工具实例
export const cssAnalyzerTool = new CSSAnalyzerTool();