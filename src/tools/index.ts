import { toolManager } from './tool-manager';
import { domTool } from './get-dom';
import { cssAnalyzerTool } from './css-analyzer';

// 注册所有工具
export function registerAllTools() {
    toolManager.registerTool(domTool);
    toolManager.registerTool(cssAnalyzerTool);
    
    console.log('所有工具已注册完成');
}

export { toolManager, domTool, cssAnalyzerTool };