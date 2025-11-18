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
    }
    
    namespace runtime {
      function sendMessage(message: any): Promise<any>
      function onMessage(): {
        addListener(callback: (message: any, sender: any, sendResponse: (response?: any) => void) => boolean | void): void
      }
    }
  }
}

export {}