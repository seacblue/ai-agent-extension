import { ToolManagerImpl } from './toolManager';
import { DOMTool } from './getDOM';
import { CSSAnalyzerTool } from './cssAnalyzer';

// 注册所有工具
export function registerAllTools() {
  ToolManagerImpl.registerTool(DOMTool);
  ToolManagerImpl.registerTool(CSSAnalyzerTool);

  console.log('所有工具已注册完成');
}

export { ToolManagerImpl };
