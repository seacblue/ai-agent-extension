<template>
    <div class="ai-assistant">
        <!-- 复制成功提示popup -->
        <div v-if="showCopyPopup" class="copy-popup">
            {{ copyPopupMessage }}
        </div>
        
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
                            'thinking': message.type === 'thinking',
                            'status-success': message.status === 'success',
                            'status-error': message.status === 'error'
                        }"
                        @mouseenter="onMessageHover(message.id, true)"
                        @mouseleave="onMessageHover(message.id, false)"
                        @click="onMessageClick(message.id)">
                        <div class="message-background"></div>
                        <div class="message-content-wrapper">
                            <!-- 普通消息内容 -->
                            <div v-if="message.type !== 'thinking'" class="message-content">{{ message.content }}</div>
                            
                            <!-- 思考过程消息 -->
                            <div v-else class="thinking-content">
                                <div class="thinking-steps">
                                    <div v-for="(step, index) in message.thinkingSteps" :key="step.id" 
                                         class="thinking-step"
                                         :class="{ 
                                             'new-step': isNewStep(step.id),
                                             'thinking-complete': isThinkingComplete(message) && index === message.thinkingSteps!.length - 1
                                         }">
                                        <div class="step-content">{{ step.content }}</div>
                                    </div>
                                </div>
                                <div v-if="!isThinkingComplete(message)" class="thinking-progress">
                                    <span>思考进行中</span>
                                    <div class="progress-dots">
                                        <div class="progress-dot"></div>
                                        <div class="progress-dot"></div>
                                        <div class="progress-dot"></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div v-if="message.type !== 'thinking'" class="message-footer">
                                <div v-if="message.type === 'user'" class="message-time">{{ message.timestamp }}</div>
                                <button class="copy-button" @click="copyToClipboard(message.content)" :title="'复制'">
                                    <img src="/icons/copy.png" alt="复制" class="copy-icon" />
                                </button>
                                <div v-if="message.type === 'assistant'" class="message-time">{{ message.timestamp }}</div>
                            </div>
                        </div>
                    </div>
                </div>
        
                <div class="input-area">
                    <div class="input-wrapper">
                        <input 
                            v-model="inputText" 
                            @keyup.enter="sendMessage"
                            placeholder="输入问题，如：分析页面 DOM 结构..."
                            class="message-input"
                        />
                    </div>
                    <button @click="handleButtonClick" :disabled="!inputText.trim() && !isSending" class="send-button" :class="{ 'terminate-button': isSending }">
                        <img :src="isSending ? '/icons/stop_thinking.png' : '/icons/send_message.png'" :alt="isSending ? '终止' : '发送'" class="send-icon" />
                        <span>{{ isSending ? '终止' : '发送' }}</span>
                        <!-- Debug: {{ isSending }} -->
                    </button>
                </div>
            </div>
        </main>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick, watch } from 'vue'
import { generateId, getCurrentTimestamp } from '../shared/utils'

interface Message {
    id: number
    type: 'user' | 'assistant' | 'thinking'
    content: string
    timestamp: string
    status: 'success' | 'error'
    completed?: boolean
    thinkingSteps?: ThinkingStep[]
}

interface ThinkingStep {
    id: number
    content: string
    timestamp: string
}

const inputText = ref('')
const messages = reactive<Message[]>([])
const messagesRef = ref<HTMLElement>()
const newStepIds = ref<Set<number>>(new Set())
const isSending = ref(false)
const showCopyPopup = ref(false)
const copyPopupMessage = ref('')

const handleButtonClick = () => {
    if (isSending.value) {
        terminateMessage()
    } else {
        sendMessage()
    }
}

const sendMessage = async () => {
    if (!inputText.value.trim()) return
    
    isSending.value = true
    
    // 添加一个小延迟确保UI更新
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const userMessage: Message = {
        id: generateId(),
        type: 'user',
        content: inputText.value,
        timestamp: getCurrentTimestamp(),
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
        
        // 处理响应
        handleBackgroundResponse(response)
        
    } catch (error) {
        console.error('发送消息失败: ', error)
        
        let errorContent = '抱歉，处理您的问题时遇到了错误，请稍后再试。'
        window.addMessage('assistant', errorContent, 'error')
        isSending.value = false
    }
    
    await scrollToBottom()
}

const terminateMessage = async () => {
    isSending.value = false
    window.finishThinkingProcess()
    
    // 向 Background 发送终止消息
    try {
        await chrome.runtime.sendMessage({
            type: 'TERMINATE_PROCESS'
        })
    } catch (error) {
        console.error('发送终止消息失败: ', error)
    }
}

// 统一处理后台响应
const handleBackgroundResponse = (response: any) => {
    if (!response) {
        window.addMessage('assistant', '未收到有效响应', 'error')
        isSending.value = false
        return
    }

    switch (response.type) {
        case 'thinking':
            // 显示思考过程
            if (response.content) {
                window.addThinkingMessage(response.content)
            }
            break
            
        case 'answer':
            // 显示最终回答
            if (response.answer) {
                window.finishThinkingProcess()
                window.addMessage('assistant', response.answer, 'success')
            }
            isSending.value = false
            break
        
        case 'error':
            // 显示错误信息
            if (response.error) {
                window.finishThinkingProcess()
                window.addMessage('assistant', response.error, 'error')
            }
            isSending.value = false
            break
            
        case 'started':
            // 处理开始响应，显示加载状态
            console.log('思考过程已开始')
            break
            
        default:
            // 兼容旧格式
            if (response.answer) {
                window.addMessage('assistant', response.answer, 'success')
            } else if (response.error) {
                window.addMessage('assistant', response.error, 'error')
            } else {
                window.addMessage('assistant', '收到未知格式的响应', 'error')
            }
            isSending.value = false
    }
}

// 滚动到底部函数
const scrollToBottom = async () => {
    await nextTick()
    if (messagesRef.value) {
        messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
}

// 复制到剪贴板功能
const copyToClipboard = async (content: string) => {
    try {
        await navigator.clipboard.writeText(content)
        showCopyPopupMessage('内容已复制到剪贴板')
    } catch (error) {
        console.error('复制失败: ', error)
        // 降级方案：使用传统的复制方法
        try {
            const textArea = document.createElement('textarea')
            textArea.value = content
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
            showCopyPopupMessage('内容已复制到剪贴板')
        } catch (fallbackError) {
            console.error('降级复制方案也失败: ', fallbackError)
            showCopyPopupMessage('复制失败，请手动复制')
        }
    }
}

// 显示复制提示popup
const showCopyPopupMessage = (message: string) => {
    copyPopupMessage.value = message
    showCopyPopup.value = true
    
    // 3秒后自动隐藏
    setTimeout(() => {
        showCopyPopup.value = false
    }, 3000)
}



// 判断思考是否完成
const isThinkingComplete = (message: Message): boolean => {
    return message.completed === true
}

// 判断是否为新步骤
const isNewStep = (stepId: number): boolean => {
    return newStepIds.value.has(stepId)
}

// 消息悬停处理
const onMessageHover = (messageId: number, isHovering: boolean) => {
    // 可以在这里添加悬停效果逻辑
    console.log(`Message ${messageId} hover: ${isHovering}`)
}

// 消息点击处理
const onMessageClick = (messageId: number) => {
    // 可以在这里添加点击效果逻辑
    console.log(`Message ${messageId} clicked`)
}

// 创建思考消息
const createThinkingMessage = (content: string): Message => {
    const stepId = generateId()
    const thinkingStep: ThinkingStep = {
        id: stepId,
        content,
        timestamp: getCurrentTimestamp()
    }
    
    return {
        id: generateId(),
        type: 'thinking',
        content: '',
        timestamp: getCurrentTimestamp(),
        status: 'success',
        thinkingSteps: [thinkingStep]
    }
}

// 配置选项
const config = {
    enableThinkingMerge: true, // 启用思考过程自动合并
    enableProgressiveDisplay: true // 启用渐进式显示
}

const shouldMergeThinking = (): boolean => {
    // 如果没有消息，不能合并
    if (messages.length === 0) return false
    
    // 检查最后一个消息是否为未完成的 thinking 消息
    const lastMessage = messages[messages.length - 1]
    return lastMessage.type === 'thinking' && lastMessage.completed !== true
}

window.addThinkingMessage = (content: string) => {
    const stepId = generateId()
    const newStep: ThinkingStep = {
        id: stepId,
        content,
        timestamp: getCurrentTimestamp()
    }
    
    if (shouldMergeThinking() || !config.enableThinkingMerge) {
        const lastThinking = messages[messages.length - 1]
        if (!lastThinking.thinkingSteps) {
            lastThinking.thinkingSteps = []
        }
        
        // 添加新步骤到现有思考消息
        lastThinking.thinkingSteps.push(newStep)
        newStepIds.value.add(stepId)
        nextTick(() => {
            requestAnimationFrame(() => {
                setTimeout(() => {
                    newStepIds.value.delete(stepId)
                }, 300)
            })
        })
        
        return lastThinking.id
    }
    
    // 创建新的思考消息
    const thinkingMessage = createThinkingMessage(content)
    messages.push(thinkingMessage)
    newStepIds.value.add(stepId)
    nextTick(() => {
        requestAnimationFrame(() => {
            setTimeout(() => {
                newStepIds.value.delete(stepId)
            }, 300)
        })
    })
    
    return thinkingMessage.id
}

window.finishThinkingProcess = () => {
    if (messages.length === 0) return
    
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.type === 'thinking' && lastMessage.completed !== true) {
        lastMessage.completed = true
    }
}

window.updateThinkingConfig = (newConfig: Partial<typeof config>) => {
    Object.assign(config, newConfig)
}

window.addMessage = (type: 'user' | 'assistant', content: string, status: 'success' | 'error' = 'success') => {
    const message: Message = {
        id: generateId(),
        type,
        content,
        timestamp: getCurrentTimestamp(),
        status
    }
    messages.push(message)
    
    // 只对 assistant 消息自动滚动
    if (type === 'assistant') {
        scrollToBottom()
    }
    
    return message.id
}

watch(messages, (newMessages) => {
    if (newMessages.length > 0) {
        const latestMessage = newMessages[newMessages.length - 1]
        if (latestMessage.type === 'assistant') {
            scrollToBottom()
        }
    }
})

onMounted(() => {
    window.addMessage('assistant', 
        '你好！我是 AI 开发者助手，可以帮你分析页面 DOM 结构、CSS 样式、网络请求等。有什么问题尽管问我！',
        'success')

    chrome.runtime.onMessage.addListener((message) => {
        handleBackgroundResponse(message)
    })

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
.message.user:hover,
.message.user:hover .message-background {
    filter: brightness(0.85);
}

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
.message.assistant.status-error:hover,
.message.assistant.status-error:hover .message-background {
    filter: brightness(0.85);
}

/* 消息内容 */
.message-content {
    margin-bottom: 6px;
    line-height: 1.4;
    word-wrap: break-word;
    font-size: 15px;
    white-space: pre-line;
}

/* 消息底部容器 - 更紧凑 */
.message-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
    gap: 8px;
}

/* 复制按钮样式 */
.copy-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    border-radius: 4px;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
}

.copy-button:hover {
    background-color: rgba(200, 200, 200, 0.3);
}

.copy-button:hover .copy-icon {
    filter: brightness(0.7);
}

.copy-icon {
    width: 14px;
    height: 14px;
    transition: filter 0.2s ease;
    opacity: 0.7;
}

/* 用户消息的复制按钮 */
.message.user .copy-button {
    background: none;
    margin-left: auto;
    margin-right: 0;
}

.message.user .copy-button:hover {
    background: rgba(255, 255, 255, 0.1);
}

.message.user .copy-icon {
    filter: brightness(0) invert(1);
    opacity: 1;
}

.message.user .copy-button:hover .copy-icon {
    filter: brightness(0) invert(1) brightness(1.2);
}

.message.assistant .copy-button {
    margin-right: auto;
    margin-left: -2px;
}

/* 时间戳样式 */
.message-time {
    font-size: 11px;
    opacity: 0.8;
    font-weight: 500;
    color: inherit;
}

/* 用户消息的时间戳 */
.message.user .message-time {
    color: rgba(255, 255, 255, 0.8);
}

/* 助手消息的时间戳 */
.message.assistant .message-time {
    color: #666;
}

/* 复制成功提示popup */
.copy-popup {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
    color: white;
    padding: 12px 24px;
    border-radius: 25px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);
    z-index: 1000;
    animation: popupSlideIn 0.3s ease-out;
    transition: all 0.3s ease;
}

.copy-popup:hover {
    transform: translateX(-50%) translateY(-2px);
    box-shadow: 0 6px 20px rgba(40, 167, 69, 0.4);
}

@keyframes popupSlideIn {
    from {
        opacity: 0;
        transform: translateX(-50%) translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
    }
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
    align-items: flex-start;
    flex-shrink: 0;
}

.input-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
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
    margin-bottom: 4px;
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
    transition: transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease;
    box-shadow: 0 4px 15px rgba(0, 123, 255, 0.3);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    flex-shrink: 0;
    margin-top: 0;
}

.send-button.terminate-button {
    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
    box-shadow: 0 4px 15px rgba(220, 53, 69, 0.3);
}

.send-button.terminate-button:hover:not(:disabled) {
    background: linear-gradient(135deg, #c82333 0%, #bd2130 100%);
    box-shadow: 0 6px 20px rgba(220, 53, 69, 0.4);
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

.messages {
    scrollbar-width: thin;
    scrollbar-color: #c1c1c1 #f1f1f1;
}

/* 思考状态 */
.message.thinking {
    color: #333;
    margin-right: auto;
    padding: 12px 16px;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
    cursor: default;
    transition: none;
    transform: none;
    width: 100%;
    margin-bottom: 0;
}

.message.thinking .message-background {
    background: transparent;
    box-shadow: none;
    padding: 0;
}

.message.thinking:hover,
.message.thinking:hover .message-background {
    transform: none;
    box-shadow: none;
    filter: none;
}
.message.thinking:active { transform: none; }

/* 思考内容样式 */
.thinking-content {
    width: 100%;
    color: #9ca3af;
    font-size: 13px;
    line-height: 2.2;
    transition: all 0.3s ease;
}

/* 思考步骤样式 */
.thinking-steps {
    position: relative;
    padding-left: 0;
    transition: all 0.3s ease;
}

.thinking-step {
    position: relative;
    margin-bottom: -4px;
    opacity: 1;
    transform: translateY(0);
    transition: all 0.3s ease;
    max-height: 200px;
    overflow: hidden;
}

.step-content {
    font-size: 13px;
    white-space: pre-line;
    word-wrap: break-word;
    transform: translateY(-4px);
}

.new-step {
    animation: slideInNewStep 0.3s ease-out;
}

@keyframes slideInNewStep {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* 思考进度指示器 */
.thinking-progress {
    margin-top: 8px;
    margin-left: -8px;
    padding: 4px 0 4px 8px;
    background-color: #f9fafb;
    border-radius: 4px;
    font-size: 11px;
    color: #9ca3af;
    display: flex;
    align-items: center;
    gap: 6px;
}

.progress-dots {
    display: flex;
    gap: 2px;
}

.progress-dot {
    width: 4px;
    height: 4px;
    background-color: #e5e7eb;
    border-radius: 50%;
    animation: pulse 1.5s infinite;
}

.progress-dot:nth-child(2) {
    animation-delay: 0.3s;
}

.progress-dot:nth-child(3) {
    animation-delay: 0.6s;
}

@keyframes pulse {
    0%, 100% {
        opacity: 0.3;
        transform: scale(0.8);
    }
    50% {
        opacity: 1;
        transform: scale(1);
    }
}
</style>