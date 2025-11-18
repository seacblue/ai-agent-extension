<template>
    <div class="ai-assistant">
        <header class="assistant-header">
            <h2>AI 开发者助手</h2>
            <p>分析 DOM、CSS、网络请求，获取优化建议</p>
        </header>
    
        <main class="assistant-main">
            <div class="chat-container">
                <div class="messages" ref="messagesRef">
                    <div v-for="message in messages" :key="message.id" 
                        :class="['message', message.type]">
                        <div class="message-content">{{ message.content }}</div>
                        <div class="message-time">{{ message.timestamp }}</div>
                    </div>
                </div>
        
                <div class="input-area">
                    <input 
                        v-model="inputText" 
                        @keyup.enter="sendMessage"
                        placeholder="输入问题，如：分析页面 DOM 结构..."
                        class="message-input"
                    />
                    <button @click="sendMessage" :disabled="!inputText.trim()" class="send-button">
                        发送
                    </button>
                </div>
            </div>
        </main>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'

interface Message {
    id: number
    type: 'user' | 'assistant'
    content: string
    timestamp: string
}

const inputText = ref('')
const messages = reactive<Message[]>([])
const messagesRef = ref<HTMLElement>()

const sendMessage = async () => {
    if (!inputText.value.trim()) return
    
    const userMessage: Message = {
        id: Date.now(),
        type: 'user',
        content: inputText.value,
        timestamp: new Date().toLocaleTimeString()
    }
    
    messages.push(userMessage)
    const question = inputText.value
    inputText.value = ''
    
    // 发送消息到 background script
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'ASK_QUESTION',
            question
        })
        
        const assistantMessage: Message = {
            id: Date.now() + 1,
            type: 'assistant',
            content: response.answer,
            timestamp: new Date().toLocaleTimeString()
        }
        
        messages.push(assistantMessage)
    } catch (error) {
        console.error('发送消息失败: ', error)
    }
}

// 自动滚动到底部
const scrollToBottom = () => {
    if (messagesRef.value) {
        messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
}

onMounted(() => {
    // 欢迎消息
    messages.push({
        id: 1,
        type: 'assistant',
        content: '你好！我是 AI 开发者助手，可以帮你分析页面 DOM 结构、CSS 样式、网络请求等。有什么问题尽管问我！',
        timestamp: new Date().toLocaleTimeString()
    })
})
</script>

<style scoped>
.ai-assistant {
    height: 100vh;
    display: flex;
    flex-direction: column;
}

.assistant-header {
    padding: 16px;
    border-bottom: 1px solid #e0e0e0;
    background: #f5f5f5;
}

.assistant-header h2 {
    margin: 0 0 4px 0;
    font-size: 16px;
}

.assistant-header p {
    margin: 0;
    font-size: 12px;
    color: #666;
}

.assistant-main {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.chat-container {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
}

.message {
    margin-bottom: 16px;
    padding: 12px;
    border-radius: 8px;
    max-width: 80%;
}

.message.user {
    background: #007bff;
    color: white;
    margin-left: auto;
}

.message.assistant {
    background: #f1f1f1;
    color: #333;
    margin-right: auto;
}

.message-content {
    margin-bottom: 4px;
}

.message-time {
    font-size: 10px;
    opacity: 0.7;
}

.input-area {
    padding: 16px;
    border-top: 1px solid #e0e0e0;
    display: flex;
    gap: 8px;
}

.message-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
}

.send-button {
    padding: 8px 16px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.send-button:disabled {
    background: #ccc;
    cursor: not-allowed;
}
</style>