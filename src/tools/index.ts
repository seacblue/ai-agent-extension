import { toolManager } from './tool-manager';
import { domTool } from './getDOM';
import { cssAnalyzerTool } from './CSSAnalyzer';

// 注册所有工具
export function registerAllTools() {
    toolManager.registerTool(domTool);
    toolManager.registerTool(cssAnalyzerTool);
    
    console.log('所有工具已注册完成');
}

export { toolManager };