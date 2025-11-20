// Chrome Extensions API types
declare global {
  namespace chrome {
    namespace devtools {
      namespace panels {
        function create(
          title: string,
          iconPath: string,
          pagePath: string,
          callback?: (panel: ExtensionPanel) => void
        ): ExtensionPanel
        
        interface ExtensionPanel {
          onShown: {
            addListener(callback: () => void): void
            removeListener(callback: () => void): void
          }
          onHidden: {
            addListener(callback: () => void): void
            removeListener(callback: () => void): void
          }
        }
      }
      
      namespace inspectedWindow {
        const tabId: number
        function eval(expression: string, callback?: (result: any, exceptionInfo: any) => void): void
      }
    }
    
    namespace runtime {
      function sendMessage(message: any): Promise<any>
      function onMessage(): {
        addListener(callback: (message: any, sender: any, sendResponse: (response?: any) => void) => boolean | void): void
      }
    }
  }

  // 全局接口类型声明
  interface Window {
    addThinkingMessage: (content: string) => number
    addMessage: (type: 'USER' | 'ASSISTANT', content: string, status?: 'success' | 'error') => number
    updateThinkingConfig: (newConfig: Partial<ThinkingConfig>) => void
    getThinkingConfig: () => ThinkingConfig
    finishThinkingProcess: () => void
  }

  interface ThinkingConfig {
    enableThinkingMerge: boolean
    mergeTimeWindow: number
    maxMergeInterval: number
    maxThinkingParts: number
    enableProgressiveDisplay: boolean
  }

  interface Message {
    id: number
    type: 'USER' | 'ASSISTANT' | 'THINKING'
    content: string
    timestamp: string
    status: 'success' | 'error'
    completed?: boolean
  }
}

export {}