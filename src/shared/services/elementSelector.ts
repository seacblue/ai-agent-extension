// 元素选择器服务模块
class ElementSelectorService {
  private isSelectingElement = false;
  private elementOverlay: HTMLDivElement | null = null;
  private originalUserSelect: string | null = null;

  // 绑定this的事件处理函数
  private boundHandleMouseOver: (event: MouseEvent) => void;
  private boundHandleMouseOut: (event: MouseEvent) => void;
  private boundHandleClick: (event: MouseEvent) => void;
  private boundHandleContextMenu: (event: MouseEvent) => void;
  private boundHandleMouseDown: (event: MouseEvent) => void;
  private boundHandleMouseUp: (event: MouseEvent) => void;
  private boundHandleDoubleClick: (event: MouseEvent) => void;
  private boundHandleKeyDown: (event: KeyboardEvent) => void;
  private boundHandleKeyUp: (event: KeyboardEvent) => void;
  private boundHandleKeyPress: (event: KeyboardEvent) => void;
  private boundHandleFocus: (event: Event) => void;
  private boundHandleBlur: (event: Event) => void;

  constructor() {
    this.boundHandleMouseOver = this.handleMouseOver.bind(this);
    this.boundHandleMouseOut = this.handleMouseOut.bind(this);
    this.boundHandleClick = this.handleClick.bind(this);
    this.boundHandleContextMenu = this.handleContextMenu.bind(this);
    this.boundHandleMouseDown = this.handleMouseDown.bind(this);
    this.boundHandleMouseUp = this.handleMouseUp.bind(this);
    this.boundHandleDoubleClick = this.handleDoubleClick.bind(this);
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleKeyUp = this.handleKeyUp.bind(this);
    this.boundHandleKeyPress = this.handleKeyPress.bind(this);
    this.boundHandleFocus = this.handleFocus.bind(this);
    this.boundHandleBlur = this.handleBlur.bind(this);
  }

  // 启动元素选择器
  public startElementSelector(): void {
    if (this.isSelectingElement) {
      console.log('元素选择器已在运行中');
      return;
    }

    this.isSelectingElement = true;
    console.log('启动元素选择器');

    // 创建高亮覆盖层
    this.createHighlightOverlay();

    if (!document.body.classList.contains('element-selector-active')) {
      document.body.classList.add('element-selector-active');
    }

    // 保存原始的 user-select 设置，防止文本选中干扰
    this.originalUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    // 添加事件监听器，使用捕获阶段确保能捕获所有事件
    document.addEventListener('mouseover', this.boundHandleMouseOver, true);
    document.addEventListener('mouseout', this.boundHandleMouseOut, true);
    document.addEventListener('click', this.boundHandleClick, true);
    document.addEventListener('contextmenu', this.boundHandleContextMenu, true);

    document.addEventListener('mousedown', this.boundHandleMouseDown, true);
    document.addEventListener('mouseup', this.boundHandleMouseUp, true);
    document.addEventListener('dblclick', this.boundHandleDoubleClick, true);
    document.addEventListener('keydown', this.boundHandleKeyDown, true);
    document.addEventListener('keyup', this.boundHandleKeyUp, true);
    document.addEventListener('keypress', this.boundHandleKeyPress, true);
    document.addEventListener('focus', this.boundHandleFocus, true);
    document.addEventListener('blur', this.boundHandleBlur, true);

    // 显示提示信息
    this.showSelectionTooltip();
  }

  // 停止元素选择器
  public stopElementSelector(): void {
    if (!this.isSelectingElement) {
      return;
    }
    this.isSelectingElement = false;
    console.log('停止元素选择器');

    // 移除覆盖层
    this.removeHighlightOverlay();
    this.hideSelectionTooltip();

    // 移除所有事件监听器，确保使用与添加时相同的参数（包括捕获标志）
    document.removeEventListener('mouseover', this.boundHandleMouseOver, true);
    document.removeEventListener('mouseout', this.boundHandleMouseOut, true);
    document.removeEventListener('click', this.boundHandleClick, true);
    document.removeEventListener(
      'contextmenu',
      this.boundHandleContextMenu,
      true
    );

    document.removeEventListener('mousedown', this.boundHandleMouseDown, true);
    document.removeEventListener('mouseup', this.boundHandleMouseUp, true);
    document.removeEventListener('dblclick', this.boundHandleDoubleClick, true);
    document.removeEventListener('keydown', this.boundHandleKeyDown, true);
    document.removeEventListener('keyup', this.boundHandleKeyUp, true);
    document.removeEventListener('keypress', this.boundHandleKeyPress, true);
    document.removeEventListener('focus', this.boundHandleFocus, true);
    document.removeEventListener('blur', this.boundHandleBlur, true);

    // 恢复页面原始状态
    if (document.body.classList.contains('element-selector-active')) {
      document.body.classList.remove('element-selector-active');
    }

    // 恢复 user-select 设置
    if (this.originalUserSelect) {
      document.body.style.userSelect = this.originalUserSelect;
      this.originalUserSelect = null;
    } else {
      document.body.style.userSelect = '';
    }

    // 恢复鼠标样式
    document.body.style.cursor = '';

    setTimeout(() => {
      this.elementOverlay = null;
    }, 0);
  }

  // 创建高亮覆盖层
  private createHighlightOverlay(): void {
    if (this.elementOverlay) {
      this.removeHighlightOverlay();
    }

    // 创建覆盖层元素
    this.elementOverlay = document.createElement('div');

    // 设置 ID 和类名
    this.elementOverlay.id = 'element-selector-overlay';
    this.elementOverlay.className = 'element-selector-overlay';

    Object.assign(this.elementOverlay.style, {
      position: 'absolute',
      pointerEvents: 'none',
      border: '2px solid #007bff',
      backgroundColor: 'rgba(0, 123, 255, 0.1)',
      zIndex: '999999',
      boxSizing: 'border-box',
      outline: 'none',
      transition: 'all 0.1s ease',
      boxShadow: '0 0 0 1px rgba(0, 123, 255, 0.3)',
    });

    document.body.appendChild(this.elementOverlay);
  }

  // 移除高亮覆盖层
  private removeHighlightOverlay(): void {
    if (this.elementOverlay) {
      this.elementOverlay.remove();
      this.elementOverlay = null;
    }
  }

  // 处理鼠标悬停
  private handleMouseOver(event: MouseEvent): void {
    if (!this.isSelectingElement || !this.elementOverlay) return;

    let target = event.target as Element;

    if (
      target.nodeType === Node.TEXT_NODE ||
      target.nodeType === Node.COMMENT_NODE
    ) {
      target = target.parentElement || target;
    }

    const rect = target.getBoundingClientRect();

    console.log('鼠标悬停在元素上: ', target.tagName, target, rect);

    this.elementOverlay.style.display = 'block';
    this.elementOverlay.style.top = `${rect.top + window.scrollY}px`;
    this.elementOverlay.style.left = `${rect.left + window.scrollX}px`;
    this.elementOverlay.style.width = `${rect.width}px`;
    this.elementOverlay.style.height = `${rect.height}px`;
  }

  // 处理鼠标移出
  private handleMouseOut(event: MouseEvent): void {
    if (!this.isSelectingElement || !this.elementOverlay) return;

    const relatedTarget = event.relatedTarget as Element;
    if (!relatedTarget || !this.elementOverlay.contains(relatedTarget)) {
      this.elementOverlay.style.display = 'none';
    }
  }

  // 处理点击事件
  private handleClick(event: MouseEvent): void {
    if (!this.isSelectingElement) return;

    // 阻止事件冒泡和默认行为，确保选择器正常工作
    event.stopPropagation();
    event.preventDefault();

    let target = event.target as Element;

    if (
      target.nodeType === Node.TEXT_NODE ||
      target.nodeType === Node.COMMENT_NODE
    ) {
      target = target.parentElement || target;
    }

    console.log('元素已选中: ', target.tagName, target);

    // 获取元素信息
    const elementInfo = this.getElementInfo(target);

    // 停止元素选择器，确保在发送消息前清理干净
    this.stopElementSelector();

    // 确保完全恢复页面状态后再发送消息
    setTimeout(() => {
      // 确保消息包含所有必要的信息，避免 Panel 处理问题
      chrome.runtime.sendMessage(
        {
          type: 'ELEMENT_SELECTED_RESULT',
          elementData: elementInfo,
          success: true,
          timestamp: Date.now(),
        },
        response => {
          // 错误处理，确保消息发送成功
          if (chrome.runtime.lastError) {
            console.warn('元素选择结果发送失败: ', chrome.runtime.lastError);
          } else {
            console.log('元素选择结果发送成功: ', response);
          }
        }
      );
    }, 0);
  }

  // 处理右键菜单
  private handleContextMenu(event: MouseEvent): void {
    if (!this.isSelectingElement) return;
    event.preventDefault();
    event.stopPropagation();

    // 停止元素选择器
    this.stopElementSelector();
  }

  // 处理鼠标按下
  private handleMouseDown(event: MouseEvent): void {
    if (!this.isSelectingElement) return;
    event.preventDefault();
    event.stopPropagation();
  }

  // 处理鼠标释放
  private handleMouseUp(event: MouseEvent): void {
    if (!this.isSelectingElement) return;
    event.preventDefault();
    event.stopPropagation();
  }

  // 处理双击
  private handleDoubleClick(event: MouseEvent): void {
    if (!this.isSelectingElement) return;
    event.preventDefault();
    event.stopPropagation();
  }

  // 处理键盘按下
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isSelectingElement) return;
    event.stopPropagation();
    event.preventDefault();
  }

  // 处理键盘释放
  private handleKeyUp(event: KeyboardEvent): void {
    if (!this.isSelectingElement) return;
    event.preventDefault();
    event.stopPropagation();
  }

  // 处理键盘按键
  private handleKeyPress(event: KeyboardEvent): void {
    if (!this.isSelectingElement) return;
    event.preventDefault();
    event.stopPropagation();
  }

  // 处理焦点
  private handleFocus(event: Event): void {
    if (!this.isSelectingElement) return;
    event.preventDefault();
    event.stopPropagation();
  }

  // 处理失焦
  private handleBlur(event: Event): void {
    if (!this.isSelectingElement) return;
    event.preventDefault();
    event.stopPropagation();
  }

  // 获取元素信息
  private getElementInfo(element: Element): ElementInfo {
    try {
      // 基本信息
      const tagName = element.tagName.toLowerCase();
      const id = element.getAttribute('id') || '';
      const className = element.getAttribute('class') || '';
      const textContent = element.textContent || '';
      const innerHTML = element.innerHTML || '';

      // 位置和尺寸
      const rect = element.getBoundingClientRect();
      const position = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };

      // CSS 属性
      const computedStyle = window.getComputedStyle(element);
      const cssProperties: Record<string, string> = {};

      // 获取常用 CSS 属性
      const commonProps = [
        'display',
        'visibility',
        'opacity',
        'position',
        'top',
        'left',
        'right',
        'bottom',
        'width',
        'height',
        'max-width',
        'max-height',
        'margin',
        'padding',
        'border',
        'background-color',
        'color',
        'font-size',
        'font-family',
        'text-align',
        'line-height',
        'white-space',
        'flex',
        'grid',
        'z-index',
      ];

      commonProps.forEach(prop => {
        cssProperties[prop] = computedStyle.getPropertyValue(prop);
      });

      // 获取元素的 XPath
      const xpath = this.getXPath(element);

      // 获取元素的 CSS 选择器
      const cssSelector = this.getCssSelector(element);

      // 获取元素路径 (HTML 结构)
      const path = this.getElementPath(element);

      // 获取父元素和子元素信息
      const parentInfo = element.parentElement
        ? {
            tagName: element.parentElement.tagName.toLowerCase(),
            id: element.parentElement.getAttribute('id') || '',
            className: element.parentElement.getAttribute('class') || '',
          }
        : null;

      const childElements = Array.from(element.children)
        .slice(0, 5)
        .map(child => ({
          tagName: child.tagName.toLowerCase(),
          id: child.getAttribute('id') || '',
          className: child.getAttribute('class') || '',
        }));

      return {
        tagName,
        id,
        className,
        textContent,
        innerHTML,
        position,
        cssProperties,
        xpath,
        cssSelector,
        path,
        parentInfo,
        childElements,
        childCount: element.children.length,
      };
    } catch (error) {
      console.error('获取元素信息失败: ', error);
      return {
        tagName: 'unknown',
        id: '',
        className: '',
        textContent: '',
        innerHTML: '',
        position: {
          top: 0,
          left: 0,
          width: 0,
          height: 0,
        },
        cssProperties: {},
        xpath: '',
        cssSelector: '',
        path: '',
        parentInfo: null,
        childElements: [],
        childCount: 0,
      };
    }
  }

  // 获取元素的 XPath
  private getXPath(element: Element): string {
    if (element.tagName === 'HTML') {
      return '/html';
    }

    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    let position = 1;
    let sibling = element.previousElementSibling;

    while (sibling) {
      if (sibling.tagName === element.tagName) {
        position++;
      }
      sibling = sibling.previousElementSibling;
    }

    const tagName = element.tagName.toLowerCase();
    const parentXPath = this.getXPath(element.parentElement as Element);

    return `${parentXPath}/${tagName}[${position}]`;
  }

  // 获取元素的 CSS 选择器
  private getCssSelector(element: Element): string {
    if (element.id) {
      return `#${element.id}`;
    }

    if (
      element.className &&
      typeof element.className === 'string' &&
      element.className.trim() !== ''
    ) {
      const classes = element.className
        .trim()
        .split(/\s+/)
        .map(cls => `.${cls}`)
        .join('');
      return `${element.tagName.toLowerCase()}${classes}`;
    }

    // 如果没有 id 和 class，则使用标签名和位置
    let position = 1;
    let sibling = element.previousElementSibling;

    while (sibling) {
      if (sibling.tagName === element.tagName) {
        position++;
      }
      sibling = sibling.previousElementSibling;
    }

    const tagName = element.tagName.toLowerCase();

    if (element.parentElement) {
      const parentSelector = this.getCssSelector(element.parentElement);
      return `${parentSelector} > ${tagName}:nth-of-type(${position})`;
    }

    return tagName;
  }

  // 获取元素路径 (HTML 结构)
  private getElementPath(element: Element): string {
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current.tagName !== 'HTML') {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += `#${current.id}`;
      } else if (
        current.className &&
        typeof current.className === 'string' &&
        current.className.trim() !== ''
      ) {
        const classes = current.className
          .trim()
          .split(/\s+/)
          .map(cls => `.${cls}`)
          .join('');
        selector += classes;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    path.unshift('html');
    return path.join(' > ');
  }

  // 显示选择提示
  private showSelectionTooltip(): void {
    const tooltip = document.createElement('div');
    tooltip.id = 'element-selector-tooltip';
    tooltip.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #e3f2fd;
            color: #1565c0;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 999999;
            pointer-events: none;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            text-align: center;
            min-width: 200px;
        `;
    const mainText = document.createElement('div');
    mainText.textContent = '请点击要选择的元素';
    mainText.style.cssText = `
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 4px;
        `;
    const subText = document.createElement('div');
    subText.textContent = '右键取消';
    subText.style.cssText = `
            font-size: 12px;
        `;
    tooltip.appendChild(mainText);
    tooltip.appendChild(subText);

    document.body.appendChild(tooltip);
  }

  // 隐藏选择提示
  private hideSelectionTooltip(): void {
    const tooltip = document.getElementById('element-selector-tooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }

  // 已知 bug：关闭 devtools 之后这个东西不会关掉。
  // 但是我不会改，呵呵
}

// 导出单例实例
export const elementSelector = new ElementSelectorService();

// 元素信息接口
export interface ElementInfo {
  tagName: string;
  id: string;
  className: string;
  textContent: string;
  innerHTML: string;
  position: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  cssProperties: Record<string, string>;
  xpath: string;
  cssSelector: string;
  path: string;
  parentInfo: {
    tagName: string;
    id: string;
    className: string;
  } | null;
  childElements: Array<{
    tagName: string;
    id: string;
    className: string;
  }>;
  childCount: number;
}
