// 工具基础接口定义
export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
    toolName: string;
    executionTime: number;
}

export interface ToolContext {
    tabId?: number;
    timestamp: string;
    requestId?: string;
}

export interface Tool {
    name: string;
    description: string;
    keywords: string[];
    execute: (params?: any, context?: ToolContext) => Promise<ToolResult>;
}

export interface ToolRegistry {
    tools: Map<string, Tool>;
    registerTool: (tool: Tool) => void;
    getTool: (name: string) => Tool | undefined;
    findToolsByKeywords: (keywords: string[]) => Tool[];
    listAllTools: () => Tool[];
}