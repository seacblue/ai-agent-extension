// 创建 DevTools 面板
chrome.devtools.panels.create(
    'AI 助手',
    'icons/icon16.png',
    'panel.html',
    function(panel) {
        console.log('AI 助手面板创建成功')
        
        panel.onShown.addListener(function() {
            console.log('AI 助手面板显示')
        })
        
        panel.onHidden.addListener(function() {
            console.log('AI 助手面板隐藏')
        })
    }
)