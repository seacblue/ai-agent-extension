// 元素处理服务，提供元素相关的工具方法

/**
 * 元素处理服务类，提供元素相关的工具方法
 */
export class ElementService {
  private static instance: ElementService;

  /**
   * 获取 ElementService 单例实例
   */
  public static getInstance(): ElementService {
    if (!ElementService.instance) {
      ElementService.instance = new ElementService();
    }
    return ElementService.instance;
  }

  /**
   * 生成元素信息摘要
   * @param elementData - 元素数据
   * @returns 元素摘要字符串
   */
  public static generateElementSummary(elementData: any): string {
    try {
      if (!elementData) return '未知元素';

      const tagName = elementData.tagName
        ? String(elementData.tagName)
        : '未知标签';

      let className = '';
      if (elementData.className) {
        const classes = String(elementData.className).trim();
        if (classes) {
          className = `.${classes.split(' ').join('.')}`;
        }
      }

      const id = elementData.id ? `#${String(elementData.id)}` : '';

      let textContent = '';
      if (elementData.textContent) {
        textContent = String(elementData.textContent);
      } else if (elementData.text) {
        textContent = String(elementData.text);
      }

      let text = '';
      if (typeof textContent === 'string' && textContent.length > 0) {
        text =
          textContent.length > 20
            ? textContent.substring(0, 20) + '...'
            : textContent;
      }

      return `${tagName}${id}${className}${text ? ` "${text}"` : ''}`;
    } catch (error) {
      console.error('生成元素摘要失败:', error);
      return '未知元素';
    }
  }

  /**
   * 获取元素的 CSS 选择器
   * @param elementData - 元素数据
   * @returns CSS 选择器字符串
   */
  public static getCssSelector(elementData: any): string {
    if (!elementData) return '';

    const tagName = elementData.tagName
      ? elementData.tagName.toLowerCase()
      : 'element';
    const className = elementData.className
      ? `.${elementData.className.split(' ').join('.')}`
      : '';
    const id = elementData.id ? `#${elementData.id}` : '';

    return `${tagName}${id}${className}`;
  }

  /**
   * 获取元素的基本信息
   * @param elementData - 元素数据
   * @returns 简化的元素信息对象
   */
  public static getElementBasicInfo(elementData: any): {
    tagName: string;
    id: string;
    className: string;
    text: string;
    selector: string;
  } {
    if (!elementData) {
      return {
        tagName: '未知标签',
        id: '',
        className: '',
        text: '',
        selector: '',
      };
    }

    const tagName = elementData.tagName || '未知标签';
    const id = elementData.id || '';
    const className = elementData.className || '';
    // 确保textContent是字符串类型，避免非字符串类型导致的错误
    const textContent = String(elementData.textContent || '');

    return {
      tagName: tagName.toLowerCase(),
      id,
      className,
      text:
        textContent.substring(0, 50) + (textContent.length > 50 ? '...' : ''),
      selector: this.getCssSelector(elementData),
    };
  }
}
