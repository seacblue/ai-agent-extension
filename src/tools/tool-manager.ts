import { Tool, ToolRegistry, ToolResult, ToolContext } from './types';

export class ToolManager implements ToolRegistry {
    public tools: Map<string, Tool> = new Map();

    registerTool(tool: Tool): void {
        this.tools.set(tool.name, tool);
        console.log(`工具已注册: ${tool.name}`);
    }

    getTool(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    findToolsByKeywords(keywords: string[]): Tool[] {
        const matchedTools: Tool[] = [];
        
        for (const tool of this.tools.values()) {
            const hasKeywordMatch = keywords.some(keyword => 
                tool.keywords.some(toolKeyword => 
                    toolKeyword.toLowerCase().includes(keyword.toLowerCase()) ||
                    keyword.toLowerCase().includes(toolKeyword.toLowerCase())
                )
            );
            
            if (hasKeywordMatch) {
                matchedTools.push(tool);
            }
        }
        
        return matchedTools;
    }

    listAllTools(): Tool[] {
        return Array.from(this.tools.values());
    }

    async executeTool(toolName: string, params?: any, context?: ToolContext): Promise<ToolResult> {
        const tool = this.getTool(toolName);
        if (!tool) {
            return {
                success: false,
                error: `工具 "${toolName}" 未找到`,
                toolName,
                executionTime: 0
            };
        }

        const startTime = Date.now();
        
        try {
            const result = await tool.execute(params, context);
            result.executionTime = Date.now() - startTime;
            return result;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                toolName,
                executionTime: Date.now() - startTime
            };
        }
    }

    // 根据用户问题智能选择并执行工具
    async executeToolsByKeywords(keywords: string[], params?: any, context?: ToolContext): Promise<ToolResult[]> {
        const matchedTools = this.findToolsByKeywords(keywords);
        
        if (matchedTools.length === 0) {
            return [{
                success: false,
                error: '未找到匹配的工具',
                toolName: 'none',
                executionTime: 0
            }];
        }

        const results: ToolResult[] = [];
        
        for (const tool of matchedTools) {
            const result = await this.executeTool(tool.name, params, context);
            results.push(result);
        }
        
        return results;
    }
}

// 创建全局工具管理器实例
export const toolManager = new ToolManager();