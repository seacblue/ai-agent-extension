/**
 * 页面信息相关工具函数
 */

/**
 * 创建基础页面信息对象
 */
export function createPageInfo() {
  return {
    title: document.title,
    url: window.location.href,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 创建详细页面分析信息
 */
export function createPageAnalysis() {
  return {
    ...createPageInfo(),
    userAgent: navigator.userAgent,
    elements: {
      total: document.querySelectorAll('*').length,
      images: document.querySelectorAll('img').length,
      links: document.querySelectorAll('a').length,
      scripts: document.querySelectorAll('script').length,
      styles: document.querySelectorAll('style, link[rel="stylesheet"]').length,
    },
  };
}
