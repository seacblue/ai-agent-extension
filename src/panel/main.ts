import { createApp } from 'vue'
import App from './App.vue'
import './styles/global.css'

const app = createApp(App)

try {
    app.mount('#app')
    console.log('Vue 应用挂载成功')
    
    // 测试与 Background Script 的通信
    setTimeout(() => {
        chrome.runtime.sendMessage(
            { type: 'GET_TAB_INFO' },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error('面板通信测试失败: ', chrome.runtime.lastError)
                } else {
                    console.log('面板通信测试成功: ', response)
                }
            }
        )
    }, 1000)
    
} catch (error) {
    console.error('Vue 应用挂载失败: ', error)
}