import { toolManager } from './tool-manager';
import { domTool } from './getDOM';

// 注册所有工具
export function registerAllTools() {
    toolManager.registerTool(domTool);
    
    // 未来可以在这里添加更多工具
    // toolManager.registerTool(analyticsTool);
    // toolManager.registerTool(seoTool);
    // toolManager.registerTool(accessibilityTool);
    
    console.log('所有工具已注册完成');
}

// 导出工具管理器实例
export { toolManager };

// 导出所有工具实例
export { domTool };