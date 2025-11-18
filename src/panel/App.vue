<template>
    <div class="ai-assistant">
        <!-- 复制成功提示 -->
        <div v-if="showCopyPopup" class="popup">
            {{ copyPopupMessage }}
        </div>
        
        <header class="assistant-header">
            <div class="header-content">
                <div class="header-text">
                    <h2>AI 开发者助手</h2>
                    <p>分析 DOM、CSS、网络请求，获取优化建议</p>
                </div>
                <button class="settings-button" @click="openApiKeySettings" title="设置">
            <img src="/icons/setting.png" alt="设置" class="settings-icon" />
          </button>
            </div>
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
                    </button>
                </div>
            </div>
        </main>
        
        <!-- API 密钥设置模态框 -->
        <div v-if="showApiKeySettings || isClosingModal" class="settings-modal" 
             :class="{ 'modal-closing': isClosingModal }"
             @mousedown="onModalMouseDown"
             @mouseup="onModalMouseUp">
            <div class="settings-content" :class="{ 'content-closing': isClosingModal }">
                <div class="settings-header">
                    <h3>API 密钥设置</h3>
                    <button class="close-button" @mousedown="onCloseButtonClick">×</button>
                </div>
                <div class="settings-body">
                    <div class="api-key-section">
                        <label for="apiKey">豆包 AI API 密钥:</label>
                        <div class="input-group">
                            <input 
                                id="apiKey"
                                v-model="apiKeyInput" 
                                type="password" 
                                placeholder="请输入您的豆包 AI API 密钥"
                                class="api-key-input"
                                :class="{ 'has-value': apiKeyInput.length > 0 }"
                            />
                            <button class="toggle-visibility" @click="toggleApiKeyVisibility" :title="showApiKey ? '隐藏密钥' : '显示密钥'">
                                <img 
                                :src="showApiKey ? '/icons/eye_visible.png' : '/icons/eye_invisible.png'" 
                                alt="切换显示" 
                                class="toggle-icon" 
                                />
                            </button>
                        </div>
                    </div>
                    <div class="settings-actions">
                        <button class="save-button" @click="saveApiKey" :disabled="!apiKeyInput.trim()">
                            保存密钥
                        </button>
                    </div>
                </div>
            </div>
        </div>
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

// API 密钥设置相关
const showApiKeySettings = ref(false)
const apiKeyInput = ref('')
const showApiKey = ref(false)
const isApiKeyConfigured = ref(false)
const isClosingModal = ref(false)
const mouseDownTarget = ref<EventTarget | null>(null)

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
    
    // 添加一个小延迟确保 UI 更新
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
            
        case 'streaming_content':
            break
            
        case 'streaming_complete':
        case 'answer':
            // 流式完成或直接回答，显示最终结果
            window.finishThinkingProcess()
            if (response.answer || response.content) {
                const finalAnswer = response.answer || response.content
                window.addMessage('assistant', finalAnswer, 'success')
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
            // 处理开始响应
            break
            
        default:
            // 兼容旧格式，统一处理
            const content = response.answer || response.content || response.error
            if (content) {
                const status = response.error ? 'error' : 'success'
                window.addMessage('assistant', content, status)
            } else {
                // 记录未知响应格式，便于调试
                console.warn('收到未知格式的响应:', response)
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
    }
}

// 显示复制提示
const showCopyPopupMessage = (message: string) => {
    copyPopupMessage.value = message
    showCopyPopup.value = true
    
    setTimeout(() => {
        const popupElement = document.querySelector('.popup') as HTMLElement
        if (popupElement) {
            popupElement.classList.add('hiding')
            
            setTimeout(() => {
                showCopyPopup.value = false
                copyPopupMessage.value = ''
            }, 400)
        } else {
            showCopyPopup.value = false
            copyPopupMessage.value = ''
        }
    }, 2500)
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

// API 密钥相关方法
const toggleApiKeyVisibility = () => {
    showApiKey.value = !showApiKey.value
    const input = document.getElementById('apiKey') as HTMLInputElement
    if (input) {
        input.type = showApiKey.value ? 'text' : 'password'
    }
}

const loadApiKeyToInput = async () => {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'GET_API_KEY'
        })
        
        console.log('加载 API 密钥响应:', response)
        
        if (response && response.status === 'success' && response.apiKey) {
            apiKeyInput.value = response.apiKey
            console.log('API 密钥已成功填入输入框，长度: ', response.apiKey.length)
        } else {
            console.log('未找到已保存的 API 密钥')
        }
    } catch (error) {
        console.error('加载 API 密钥失败: ', error)
    }
}

const openApiKeySettings = async () => {
    showApiKeySettings.value = true
    // 等待 DOM 更新后再加载密钥
    await nextTick()
    await loadApiKeyToInput()
}

// 模态框关闭处理方法
const onModalMouseDown = (event: MouseEvent) => {
    mouseDownTarget.value = event.target
}

const onModalMouseUp = (event: MouseEvent) => {
    // 检查鼠标按下和松开的目标是否相同，且是模态框背景
    if (mouseDownTarget.value === event.currentTarget && 
        event.target === event.currentTarget) {
        closeModalWithAnimation()
    }
    mouseDownTarget.value = null
}

const onCloseButtonClick = (event: MouseEvent) => {
    event.stopPropagation()
    closeModalWithAnimation()
}

const closeModalWithAnimation = () => {
    isClosingModal.value = true
    setTimeout(() => {
        showApiKeySettings.value = false
        isClosingModal.value = false
        apiKeyInput.value = ''
    }, 300)
}

const saveApiKey = async () => {
    if (!apiKeyInput.value || apiKeyInput.value.trim().length === 0) {
        showCopyPopupMessage('请输入有效的 API 密钥')
        return
    }

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'SET_API_KEY',
            apiKey: apiKeyInput.value.trim()
        })
        
        console.log('保存 API 密钥响应:', response)
        
        // 检查响应状态
        if (response && response.status === 'success') {
            showCopyPopupMessage('API 密钥保存成功')
            checkApiKeyStatus()
        } else {
            // 显示具体的错误信息
            const errorMessage = response?.error || '未知错误'
            showCopyPopupMessage(`保存失败: ${errorMessage}`)
            console.error('保存失败详情:', response)
        }
    } catch (error) {
        console.error('保存 API 密钥失败: ', error)
        showCopyPopupMessage('保存失败，请重试')
    }
}

const checkApiKeyStatus = async () => {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'GET_API_KEY'
        })
        
        console.log('检查 API 密钥状态响应:', response)
        
        // 检查响应状态和字段
        if (response && response.status === 'success') {
            const newStatus = response.configured || false
            // 如果状态发生变化，显示提示
            if (isApiKeyConfigured.value !== newStatus) {
                isApiKeyConfigured.value = newStatus
            } else {
                isApiKeyConfigured.value = newStatus
            }
            
            // 如果有 API 密钥且设置界面打开，自动填入
            if (response.apiKey && showApiKeySettings.value) {
                apiKeyInput.value = response.apiKey
            }
        } else {
            console.warn('检查 API 密钥状态失败:', response)
            isApiKeyConfigured.value = false
        }
    } catch (error) {
        console.error('检查 API 密钥状态失败: ', error)
        isApiKeyConfigured.value = false
    }
}

onMounted(() => {
    window.addMessage('assistant', 
        '你好！我是 AI 开发者助手，可以帮你分析页面 DOM 结构、CSS 样式、网络请求等。有什么问题尽管问我！',
        'success')

    chrome.runtime.onMessage.addListener((message) => {
        handleBackgroundResponse(message)
    })

    checkApiKeyStatus()
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

.header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.header-text h2 {
    margin: 0 0 4px 0;
    font-size: 16px;
    font-weight: 600;
}

.header-text p {
    margin: 0;
    font-size: 12px;
    opacity: 0.9;
}

.settings-button {
    background: transparent;
    border: none;
    border-radius: 8px;
    padding: 8px;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.settings-button:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
}

.settings-icon {
    width: 24px;
    height: 24px;
    filter: brightness(0) invert(1);
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

/* 错误状态下的时间戳和复制按钮 */
.message.assistant.status-error .message-time {
    color: rgba(255, 255, 255, 0.9);
}

.message.assistant.status-error .copy-button:hover {
    background-color: rgba(255, 255, 255, 0.2);
}

.message.assistant.status-error .copy-icon {
    filter: brightness(0) invert(1);
    opacity: 0.9;
}

.message.assistant.status-error .copy-button:hover .copy-icon {
    filter: brightness(0) invert(1) brightness(1.2);
}

.popup {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    color: #333;
    padding: 12px 24px;
    border-radius: 25px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    animation: popupSlideIn 0.3s ease-out;
    transition: all 0.4s ease;
    border: 1px solid #e9ecef;
}

.popup:hover {
    transform: translateX(-50%) translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
}
.popup.hiding {
    animation: popupSlideOut 0.3s ease-out forwards;
}

@keyframes popupSlideIn {
    from {
        opacity: 0;
        transform: translateX(-50%) translateY(-20px) scale(0.9);
    }
    to {
        opacity: 1;
        transform: translateX(-50%) translateY(0) scale(1);
    }
}
@keyframes popupSlideOut {
    from {
        opacity: 1;
        transform: translateX(-50%) translateY(0) scale(1);
    }
    to {
        opacity: 0;
        transform: translateX(-50%) translateY(-20px) scale(0.9);
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
.message-input::placeholder {
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
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
    animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
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

/* 设置模态框样式 */
.settings-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.settings-modal:not(.modal-closing) {
    animation: fadeIn 0.3s ease-out forwards;
}

.settings-modal.modal-closing {
    animation: fadeOut 0.3s ease-in forwards;
}

@keyframes fadeIn {
    from {
        background: rgba(0, 0, 0, 0);
    }
    to {
        background: rgba(0, 0, 0, 0.5);
    }
}

@keyframes fadeOut {
    from {
        background: rgba(0, 0, 0, 0.5);
    }
    to {
        background: rgba(0, 0, 0, 0);
    }
}

.settings-content {
    background: white;
    border-radius: 12px;
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}
.settings-content:not(.content-closing) {
    animation: bounceIn 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
}
.settings-content.content-closing {
    animation: bounceOut 0.35s ease-in forwards;
}

@keyframes bounceIn {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes bounceOut {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.5);
  }
}

.settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #e0e0e0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}
.settings-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
}

.close-button {
    background: none;
    border: none;
    color: white;
    font-size: 24px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: background 0.2s ease;
    line-height: 1;
}
.close-button:hover { background: rgba(255, 255, 255, 0.2); }

.settings-body { padding: 24px; }
.api-key-section { margin-bottom: 24px; }
.api-key-section label {
    display: block;
    margin-bottom: 8px;
    font-weight: 600;
    color: #333;
    font-size: 14px;
}

.input-group {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
}

.api-key-input {
    flex: 1;
    padding: 12px 16px;
    border: 2px solid #e9ecef;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    transition: all 0.3s ease;
    background: #f8f9fa;
}

.api-key-input:focus {
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
    background: white;
}

.toggle-visibility {
    background: #f8f9fa;
    border: 2px solid #e9ecef;
    border-radius: 8px;
    padding: 8px 12px;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.toggle-visibility:hover {
    background: #e9ecef;
    border-color: #dee2e6;
}

.toggle-icon {
    width: 20px;
    height: 20px;
    filter: brightness(0) invert(0.5);
}

.settings-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
}

.save-button {
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

.save-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 123, 255, 0.4);
    background: linear-gradient(135deg, #0056b3 0%, #004085 100%);
}

.save-button:active:not(:disabled) {
    transform: translateY(0);
}

.save-button:disabled {
    background: #6c757d;
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.save-button:disabled span {
    color: rgba(255, 255, 255, 0.6);
    text-shadow: none;
}
.save-button:not(:disabled) span {
    transition: color 0.3s ease, text-shadow 0.3s ease;
}
.save-button:hover:not(:disabled) span {
    color: #ffffff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.save-button:active:not(:disabled) span {
    color: #f0f0f0;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
}
</style>