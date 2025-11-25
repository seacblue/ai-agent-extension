import { Tool, ToolResult } from './types';

// CSS 分析器相关类型定义
interface CSSAnalyzerOptions {
  selector?: string;
  elementId?: string;
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
  error?: string;
}

// CSS 分析器工具实现
class CSSAnalyzerToolImpl implements Tool {
  name = 'cssAnalyzer';
  description = 'CSS 样式分析工具，获取元素的计算样式';
  keywords = ['CSS', '样式', 'computedStyle', '计算样式', '元素', '样式分析'];

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
          executionTime: Date.now() - startTime,
        };
      }

      // 获取计算样式
      const computedStyle = this.getComputedStyle(elementInfo.element, params);

      const result: CSSAnalysisResult = {
        success: true,
        elementInfo,
        computedStyle,
      };

      return {
        success: true,
        data: result,
        toolName: this.name,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        toolName: this.name,
        executionTime: 0,
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
        xpath: this.getXPath(element),
      };
    } catch (error) {
      console.error('获取目标元素失败:', error);
      return null;
    }
  }

  // 获取元素的计算样式
  private getComputedStyle(
    element: Element,
    params: CSSAnalyzerOptions
  ): CSSProperty[] {
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
            priority,
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
            priority,
          });
        }
      } else {
        // 返回常用的 CSS 属性
        const commonProperties = [
          'display',
          'position',
          'width',
          'height',
          'margin',
          'padding',
          'border',
          'background',
          'color',
          'font-size',
          'font-family',
          'text-align',
          'flex-direction',
          'justify-content',
          'align-items',
          'grid-template-columns',
        ];

        commonProperties.forEach(prop => {
          const value = computedStyle.getPropertyValue(prop);
          const priority = computedStyle.getPropertyPriority(prop);
          if (value && value !== 'auto' && value !== 'normal') {
            properties.push({
              property: prop,
              value: value.trim(),
              priority,
            });
          }
        });
      }
    } catch (error) {
      console.error('获取计算样式失败: ', error);
    }

    return properties;
  }

  // 获取元素的 XPath
  private getXPath(element: Element): string {
    if (!element) return '';

    const parts: string[] = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let index = 0;
      let sibling = element.previousSibling;

      while (sibling) {
        if (
          sibling.nodeType === Node.ELEMENT_NODE &&
          sibling.nodeName === element.nodeName
        ) {
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
export const CSSAnalyzerTool = new CSSAnalyzerToolImpl();
