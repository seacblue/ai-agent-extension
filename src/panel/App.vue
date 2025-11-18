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
                        :class="{
                            'message': true,
                            'user': message.type === 'user',
                            'assistant': message.type === 'assistant',
                            'status-success': message.status === 'success',
                            'status-error': message.status === 'error'
                        }"
                        @mouseenter="onMessageHover(message.id, true)"
                        @mouseleave="onMessageHover(message.id, false)"
                        @click="onMessageClick(message.id)">
                        <div class="message-background"></div>
                        <div class="message-content-wrapper">
                            <div class="message-content">{{ message.content }}</div>
                            <div class="message-time">{{ message.timestamp }}</div>
                        </div>
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
                        <img src="/icons/send_message.png" alt="发送" class="send-icon" />
                        <span>发送</span>
                    </button>
                </div>
            </div>
        </main>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick, watch } from 'vue'

interface Message {
    id: number
    type: 'user' | 'assistant'
    content: string
    timestamp: string
    status: 'success' | 'error'
}

const inputText = ref('')
const messages = reactive<Message[]>([])
const messagesRef = ref<HTMLElement>()
const hoveredMessageId = ref<number | null>(null)

const sendMessage = async () => {
    if (!inputText.value.trim()) return
    
    const userMessage: Message = {
        id: Date.now(),
        type: 'user',
        content: inputText.value,
        timestamp: new Date().toLocaleTimeString(),
        status: 'success'
    }
    
    messages.push(userMessage)
    const question = inputText.value
    inputText.value = ''
    
    // 滚动到底部
    await scrollToBottom()
    
    // 发送消息到 Background Script
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'ASK_QUESTION',
            question
        })
        
        const assistantMessage: Message = {
            id: Date.now() + 1,
            type: 'assistant',
            content: response.answer,
            timestamp: new Date().toLocaleTimeString(),
            status: 'success'
        }
        
        messages.push(assistantMessage)
    } catch (error) {
        console.error('发送消息失败: ', error)
        
        // 根据错误类型提供具体的错误信息
        let errorContent = '抱歉，处理您的问题时遇到了错误，请稍后再试。'
        if (error instanceof Error) {
            if (error.message.includes('Extension context invalidated')) {
                errorContent = '扩展上下文已失效，请刷新页面后重试。'
            } else if (error.message.includes('Receiving end does not exist')) {
                errorContent = '无法连接到后台服务，请确保扩展已正确加载。'
            } else {
                errorContent = `错误：${error.message}`
            }
        }
        
        const errorMessage: Message = {
            id: Date.now() + 1,
            type: 'assistant',
            content: errorContent,
            timestamp: new Date().toLocaleTimeString(),
            status: 'error'
        }
        
        messages.push(errorMessage)
    }
    
    await scrollToBottom()
}

// 滚动到底部函数
const scrollToBottom = async () => {
    await nextTick()
    if (messagesRef.value) {
        messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
}

// 消息悬停效果
const onMessageHover = (messageId: number, isHovering: boolean) => {
    hoveredMessageId.value = isHovering ? messageId : null
}

// 消息点击效果
const onMessageClick = (messageId: number) => {
    const message = messages.find(m => m.id === messageId)
    if (message) {
        console.log('点击消息: ', message.content)
        // Do something
    }
}

// 监听消息变化，自动滚动到底部
watch(messages, () => {
    scrollToBottom()
})

onMounted(() => {
    // 欢迎消息
    messages.push({
        id: 1,
        type: 'assistant',
        content: '你好！我是 AI 开发者助手，可以帮你分析页面 DOM 结构、CSS 样式、网络请求等。有什么问题尽管问我！',
        timestamp: new Date().toLocaleTimeString(),
        status: 'success'
    })

    // 初始滚动到底部
    scrollToBottom()
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
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    flex-shrink: 0;
}

.assistant-header h2 {
    margin: 0 0 4px 0;
    font-size: 16px;
    font-weight: 600;
}

.assistant-header p {
    margin: 0;
    font-size: 12px;
    opacity: 0.9;
}

.assistant-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #fafafa;
    min-height: 0;
}

.chat-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    scroll-behavior: smooth;
    min-height: 0;
}

.message {
    margin-bottom: 16px;
    padding: 12px 16px;
    border-radius: 12px;
    max-width: 75%;
    position: relative;
    transition: all 0.3s ease;
    cursor: pointer;
    overflow: hidden;
    animation: slideIn 0.3s ease-out;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.message:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.message:active {
    transform: translateY(0);
    transition: all 0.1s ease;
}

/* 背景层 */
.message-background {
    position: absolute;
    transition: all 0.3s ease;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
}

/* 内容层 */
.message-content-wrapper {
    position: relative;
    z-index: 2;
}

/* 用户消息基础样式 */
.message.user {
    color: white;
    margin-left: auto;
    box-shadow: 0 2px 8px rgba(0, 123, 255, 0.2);
}
.message.user .message-background {
    background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
}
.message.user:hover {
    box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
}
.message.user:hover .message-background { filter: brightness(0.85); }

/* AI 助手消息基础样式 */
.message.assistant { margin-right: auto; }
.message.assistant.status-success { color: black; }
.message.assistant.status-error { color: white; }

.message.assistant.status-success .message-background { background: white; }

.message.assistant.status-error { box-shadow: 0 2px 8px rgba(220, 53, 69, 0.2); }
.message.assistant.status-error:hover { box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3); }
.message.assistant.status-error .message-background {
    background: linear-gradient(135deg, #dc3545 0%, #fd7e14 100%);
}
.message.assistant.status-error:hover .message-background { filter: brightness(0.85); }

/* 消息内容 */
.message-content {
    margin-bottom: 6px;
    line-height: 1.4;
    word-wrap: break-word;
}

.message-time {
    font-size: 10px;
    opacity: 0.8;
    font-weight: 500;
}

.message-status {
    font-size: 11px;
    margin-top: 4px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 4px;
}

/* 输入区域 */
.input-area {
    padding: 16px;
    border-top: 1px solid #e0e0e0;
    background: white;
    display: flex;
    gap: 12px;
    align-items: center;
    flex-shrink: 0;
}

.message-input {
    flex: 1;
    padding: 12px 16px;
    border: 2px solid #e9ecef;
    border-radius: 25px;
    font-size: 14px;
    outline: none;
    transition: all 0.3s ease;
    background: #f8f9fa;
}

.message-input:focus {
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
    background: white;
}

.send-button {
    padding: 12px 20px;
    background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
    color: white;
    border: none;
    border-radius: 25px;
    cursor: pointer;
    font-weight: 600;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    box-shadow: 0 4px 15px rgba(0, 123, 255, 0.3);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
}

.send-icon {
    width: 16px;
    height: 16px;
    object-fit: contain;
    filter: brightness(0) invert(1);
    transition: transform 0.3s ease, filter 0.3s ease;
}

.send-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 123, 255, 0.4);
    background: linear-gradient(135deg, #0056b3 0%, #004085 100%);
}

.send-button:hover:not(:disabled) .send-icon {
    filter: brightness(0) invert(1) drop-shadow(0 0 2px rgba(255, 255, 255, 0.5));
}

.send-button:active:not(:disabled) {
    transform: translateY(0);
}

.send-button:active:not(:disabled) .send-icon {
    filter: brightness(0) invert(1) drop-shadow(0 0 4px rgba(255, 255, 255, 0.8));
}

.send-button:disabled {
    background: #6c757d;
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.send-button:disabled .send-icon {
    filter: brightness(0) invert(0.7) grayscale(0.8);
    opacity: 0.8;
}

.send-button:disabled span {
    color: rgba(255, 255, 255, 0.6);
    text-shadow: none;
}

.send-button:not(:disabled) span {
    transition: color 0.3s ease, text-shadow 0.3s ease;
}

.send-button:hover:not(:disabled) span {
    color: #ffffff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.send-button:active:not(:disabled) span {
    color: #f0f0f0;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.messages::-webkit-scrollbar {
    width: 6px;
}
.messages::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
}
.messages::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 3px;
}
.messages::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
}
</style>