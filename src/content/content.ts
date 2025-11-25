import { registerAllTools, toolManager } from '../tools';
import { elementSelector } from '../shared/services/elementSelector';
registerAllTools();

// 监听来自 DevTools Panel 的消息
chrome.runtime.onMessage.addListener(async (request, _sender, sendResponse) => {
  console.log('Content Script 收到消息: ', request.type, request);

  if (request.type === 'EXECUTE_TOOLS') {
    try {
      const { keywords, params, context, requestId } = request;
      console.log('CONTENT 已经收到 EXECUTE_TOOLS 信号, request =', request);

      // 立即返回处理中状态
      sendResponse({
        type: 'processing',
        requestId: requestId,
      });
      executeTools(keywords, params, context, requestId);
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error('Content Script 处理 EXECUTE_TOOLS 时出错: ', error);
      sendResponse({
        type: 'error',
        error: errorMessage,
      });
    }
    return true;
  } else if (request.type === 'START_ELEMENT_SELECTOR') {
    console.log('接收到启动元素选择器请求');
    elementSelector.startElementSelector();
    sendResponse({ type: 'success', message: '元素选择器已启动' });
    return true;
  } else {
    console.log('Content Script 收到未知消息类型: ', request.type);
    // 对于未知类型的消息，发送响应以避免通道错误
    sendResponse({ type: 'error', message: '未知的消息类型' });
    return false;
  }
});

// 通过长连接执行工具并返回结果
async function executeTools(
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
    let connectionName = 'tool-analysis-result';
    if (keywords.includes('getDOM')) {
      connectionName = 'dom-analysis-result';
    } else if (keywords.includes('cssAnalyzer')) {
      connectionName = 'css-analysis-result';
    }

    // 建立长连接并返回结果
    const port = chrome.runtime.connect({ name: connectionName });

    port.postMessage({
      type: connectionName.toUpperCase().replace('-', '_'),
      requestId: requestId,
      success: true,
      data: {
        type: 'TOOLS_EXECUTION_RESULT',
        success: true,
        results,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('长连接工具执行失败: ', error);

    // 确定连接名称
    let connectionName = 'tool-analysis-result';
    if (keywords.includes('getDOM')) {
      connectionName = 'dom-analysis-result';
    } else if (keywords.includes('cssAnalyzer')) {
      connectionName = 'css-analysis-result';
    }

    // 建立长连接并返回错误
    const port = chrome.runtime.connect({ name: connectionName });

    port.postMessage({
      type: connectionName.toUpperCase().replace('-', '_'),
      requestId: requestId,
      success: false,
      error: errorMessage,
    });
  }
}
