<template>
    <div class="ai-assistant">
        <div v-if="showPopup" class="popup" :class="popupType">
            {{ popupMessage }}
        </div>
        
        <header class="assistant-header">
            <div class="header-content">
                <div class="header-text">
                    <h2>AI 开发者助手</h2>
                    <p>分析 DOM、CSS、网络请求，获取优化建议</p>
                </div>
                <button
                    class="settings-button"
                    @click="openApiKeySettings"
                >
            <img src="/icons/setting.png" alt="设置" class="settings-icon"/>
          </button>
            </div>
        </header>
    
        <main class="assistant-main">
            <div class="chat-container">
                <div class="messages" ref="messagesRef">
                    <MessageItem 
                        v-for="message in displayMessages" 
                        :key="message.id"
                        :message="message"
                        :new-step-ids="newStepIds"
                        :is-streaming="isStreaming"
                        :current-streaming-message="currentStreamingMessage"
                        @message-click="onMessageClick"
                        @copy-to-clipboard="copyToClipboard"
                    />
                </div>
        
                <MessageInput 
                    ref="messageInputRef"
                    :is-sending="isSending"
                    :selected-element="selectedElement"
                    @send-message="sendMessage"
                    @terminate-message="terminateMessage"
                    @element-selector="handleElementSelector"
                    @remove-element="removeSelectedElement"
                />
            </div>
        </main>
        
        <!-- API 密钥设置模态框 -->
        <ApiKeyModal 
          :visible="showApiKeySettings"
          :is-api-key-configured="isApiKeyConfigured"
          @close="closeApiKeySettings"
          @save-api-key="onApiKeySaved"
          @clear-api-key="onApiKeyCleared"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick, computed } from 'vue'
import { generateId, getCurrentTimestamp } from '../shared/utils'
import MessageItem from './components/MessageItem.vue'
import MessageInput from './components/MessageInput.vue'
import ApiKeyModal from './components/ApiKeyModal.vue'

interface Message {
    id: number
    type: 'USER' | 'ASSISTANT' | 'THINKING'
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

const messageInputRef = ref<InstanceType<typeof MessageInput>>()
const messages = reactive<Message[]>([])
const messagesRef = ref<HTMLElement>()
const newStepIds = ref<Set<number>>(new Set())
const isSending = ref(false)
const showPopup = ref(false)
const popupMessage = ref('')
const popupType = ref<'success' | 'error'>('success')

// API 密钥设置相关
const showApiKeySettings = ref(false)
const isApiKeyConfigured = ref(false)

// 流式内容处理相关
const currentStreamingMessage = ref<Message | null>(null)
const isStreaming = ref(false)
const accumulatedContent = ref('') // 用于累积流式内容

// 请求管理相关
const currentRequestId = ref<string | null>(null)

// 元素信息存储
const selectedElement = ref<{
    id: string
    elementData: any
    summary: string
    timestamp: number
} | null>(null)

// 长连接管理
let panelPort: chrome.runtime.Port | null = null
let connectionRetryCount = 0
const maxRetryCount = 3
const connectionRetryDelay = 1000

// 连接状态管理
const connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')

// 建立长连接
const establishConnection = () => {
    if (panelPort) {
        console.log('长连接已存在，跳过建立')
        return panelPort
    }

    connectionStatus.value = 'connecting'
    console.log('正在建立与 Background 的长连接...')
    
    try {
        panelPort = chrome.runtime.connect({ name: 'question-response' })
        
        panelPort.onMessage.addListener((message) => {
            console.log('Panel 收到长连接消息: ', message)
            handleBackgroundResponse(message)
        })
        
        panelPort.onDisconnect.addListener(() => {
            console.log('Panel 长连接已断开')
            panelPort = null
            connectionStatus.value = 'disconnected'
            
            // 检查是否需要重连
            if (chrome.runtime.lastError) {
                console.error('连接断开原因: ', chrome.runtime.lastError.message)
                connectionStatus.value = 'error'
                
                // 如果不是主动断开且重试次数未超限，则尝试重连
                if (connectionRetryCount < maxRetryCount) {
                    connectionRetryCount++
                    console.log(`尝试重连 (${connectionRetryCount}/${maxRetryCount})...`)
                    setTimeout(() => {
                        establishConnection()
                    }, connectionRetryDelay * connectionRetryCount)
                } else {
                    console.error('长连接重连次数已达上限，停止重连')
                }
            }
        })
        
        // 连接成功
        connectionStatus.value = 'connected'
        connectionRetryCount = 0
        console.log('Panel 长连接建立成功')
        
        return panelPort
        
    } catch (error) {
        console.error('建立长连接失败: ', error)
        connectionStatus.value = 'error'
        panelPort = null
        return null
    }
}

// 计算属性：过滤掉不应该显示的消息类型
const displayMessages = computed(() => {
    return messages.filter((message: any) => {
        // 确保不显示内容为 ELEMENT_SELECTED_RESULT 的消息
        // 虽然这种消息不应该被添加到 messages 数组中，但为了安全起见进行过滤
        return message.content !== 'ELEMENT_SELECTED_RESULT'
    })
})

// 在组件挂载时主动建立长连接
onMounted(() => {
    // 主动建立到 Background 的长连接
    establishConnection()
    
    // 监听来自 Content Script 的元素选择结果
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        console.log('Panel 收到消息: ', message.type)
        
        if (message.type === 'ELEMENT_SELECTED_RESULT') {
            console.log('收到元素选择结果: ', message.elementData)
            
            // 存储元素信息
            selectedElement.value = {
                id: generateId().toString(),
                elementData: message.elementData,
                summary: generateElementSummary(message.elementData),
                timestamp: Date.now()
            }
            
            console.log('元素信息已存储: ', selectedElement.value)
            
            if (messageInputRef.value) {
                messageInputRef.value.resetElementSelector()
            }
            
            sendResponse({ success: true })
        }
        
        return true // 保持消息通道开放
    })
})

// 生成元素信息摘要
const generateElementSummary = (elementData: any): string => {
    if (!elementData) return '未知元素'
    
    const tagName = elementData.tagName || '未知标签'
    const className = elementData.className ? `.${elementData.className.split(' ').join('.')}` : ''
    const id = elementData.id ? `#${elementData.id}` : ''
    const text = elementData.text ? elementData.text.substring(0, 20) + (elementData.text.length > 20 ? '...' : '') : ''
    
    return `${tagName}${id}${className}${text ? ` "${text}"` : ''}`
}

// 移除选中的元素
const removeSelectedElement = () => { selectedElement.value = null }

const sendMessage = async () => {
    if (!messageInputRef.value?.getInputText().trim()) return
    
    isSending.value = true
    
    // 如果有之前的请求，先取消它
    if (currentRequestId.value) {
        try {
            await chrome.runtime.sendMessage({
                type: 'TERMINATE_PROCESS',
                requestId: currentRequestId.value
            })
        } catch (error) {
            console.warn('取消之前请求失败: ', error)
        }
    }
    
    // 生成新的请求 ID
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    currentRequestId.value = requestId
    
    // 获取输入框内容并清空
    const userInputText = messageInputRef.value.getInputText()
    messageInputRef.value.clearInput()
    
    // 构建包含元素信息的完整问题
    let fullQuestion = userInputText
    if (selectedElement.value) {
        const elementInfo = selectedElement.value.elementData
        const elementSummary = selectedElement.value.summary
        
        // 将元素信息作为上下文附加到问题中
        fullQuestion = `${userInputText}

---
**元素上下文信息:**
- 元素: ${elementSummary}
- 标签: ${elementInfo.tagName}
- ID: ${elementInfo.id || '无'}
- 类名: ${elementInfo.className || '无'}
- 文本内容: ${elementInfo.textContent ? elementInfo.textContent.substring(0, 100) + (elementInfo.textContent.length > 100 ? '...' : '') : '无'}
- 位置: x=${elementInfo.rect?.x || 0}, y=${elementInfo.rect?.y || 0}
- 尺寸: ${elementInfo.rect?.width || 0}x${elementInfo.rect?.height || 0}
---`
        
        console.log('将元素信息附加到问题中: ', selectedElement.value.summary)
    }
    
    // 添加一个小延迟确保 UI 更新
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const userMessage: Message = {
        id: generateId(),
        type: 'USER',
        content: userInputText,
        timestamp: getCurrentTimestamp(),
        status: 'success'
    }
    
    messages.push(userMessage)
    await scrollToBottom()
    
    const thinkingMessage: Message = {
        id: generateId(),
        type: 'THINKING',
        content: '',
        timestamp: getCurrentTimestamp(),
        status: 'success',
        completed: false,
        thinkingSteps: []
    }
    messages.push(thinkingMessage)
    await scrollToBottom()
    
    // 发送消息到 Background Script
    try {
        // 首先建立长连接
        const port = establishConnection()
        if (!port) {
            throw new Error('无法建立与 Background 的长连接')
        }
        
        // 尝试获取当前标签页信息
        let tabId = null
        
        try {
            // 在 DevTools 中，我们需要通过 chrome.devtools.inspectedWindow 获取标签页 ID
            if (chrome.devtools && chrome.devtools.inspectedWindow) {
                tabId = chrome.devtools.inspectedWindow.tabId
                console.log('从 DevTools 获取到标签页 ID: ', tabId)
            }
        } catch (devtoolsError) {
            console.warn('无法从 DevTools 获取标签页 ID: ', devtoolsError)
        }
        
        const response = await chrome.runtime.sendMessage({
            type: 'ASK_QUESTION',
            question: fullQuestion,  // 使用包含元素信息的完整问题
            tabId,  // 传递标签页 ID
            requestId  // 传递请求 ID
        })
        
        // 检查响应是否匹配当前请求 ID
        if (response && response.requestId === currentRequestId.value) {
            handleBackgroundResponse(response)
        } else {
            console.log('忽略过期请求的响应: ', response)
        }
        
    } catch (error) {
        window.finishThinkingProcess()
        console.error('发送消息失败: ', error)
        // window.addMessage('assistant', '抱歉，处理您的问题时遇到了错误，请稍后再试。', 'error')
        isSending.value = false
        currentRequestId.value = null
    }
    
    await scrollToBottom()
}

const terminateMessage = async () => {
    isSending.value = false
    window.finishThinkingProcess()
    currentRequestId.value = null // 清理请求 ID
    
    // 向 Background 发送终止消息
    try {
        await chrome.runtime.sendMessage({
            type: 'TERMINATE_PROCESS'
        })
    } catch (error) {
        console.error('发送终止消息失败: ', error)
    }
}

// 处理元素选择器
const handleElementSelector = () => {
    console.log('启动元素选择器')
    
    try {
        // 获取当前标签页ID
        let tabId: number | null = null
        
        if (chrome.devtools && chrome.devtools.inspectedWindow) {
            tabId = chrome.devtools.inspectedWindow.tabId
            console.log('获取到标签页 ID: ', tabId)
        } else {
            console.error('无法获取标签页 ID')
            showPopupMessage('无法获取当前页面信息', 'error')
            return
        }
        
        // 向 Content Script 发送启动元素选择器的消息
        chrome.tabs.sendMessage(tabId, {
            type: 'START_ELEMENT_SELECTOR',
            requestId: generateId().toString()
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.log('Content Script 可能未加载，尝试通过 Background 启动: ', chrome.runtime.lastError.message)
                // 如果直接发送到 Content Script 失败，尝试通过 Background
                chrome.runtime.sendMessage({
                    type: 'START_ELEMENT_SELECTOR',
                    requestId: generateId().toString()
                }, (bgResponse) => {
                    if (chrome.runtime.lastError) {
                        console.error('通过 Background 启动元素选择器也失败: ', chrome.runtime.lastError.message)
                        showPopupMessage('启动元素选择器失败，请刷新页面重试', 'error')
                        return
                    }
                    
                    if (!bgResponse || !bgResponse.success) {
                        console.error('通过 Background 启动元素选择器失败: ', bgResponse?.error)
                        showPopupMessage(`启动失败: ${bgResponse?.error || '未知错误'}`, 'error')
                    }
                })
                return
            }
            
            if (!response || response.type !== 'success') {
                console.error('元素选择器启动失败: ', response?.message)
                showPopupMessage(`启动失败: ${response?.message || '未知错误'}`, 'error')
            }
        })
        
    } catch (error) {
        console.error('处理元素选择器时发生错误: ', error)
        showPopupMessage('启动元素选择器失败', 'error')
    }
}

// 统一处理后台响应
const handleBackgroundResponse = (response: any) => {
    if (!response) {
        window.finishThinkingProcess()
        window.addMessage('ASSISTANT', '未收到有效响应', 'error')
        isSending.value = false
        currentRequestId.value = null
        return
    }

    switch (response.type) {
        case 'THINKING':
            window.finishThinkingProcess()
            // 显示思考过程
            if (response.content) {
                window.addThinkingMessage(response.content)
            }
            break
            
        case 'STREAMING_CONTENT':
            // 处理流式内容，实现实时拼接
            if (response.content) {
                handleStreamingContent(response.content, response.isFirstChunk)
            }
            break
            
        case 'STREAMING_COMPLETE':
            // 流式完成，恢复时间戳显示
            isStreaming.value = false
            if (currentStreamingMessage.value) {
                currentStreamingMessage.value.timestamp = getCurrentTimestamp()
                currentStreamingMessage.value = null
            }
            accumulatedContent.value = '' // 重置累积内容
            isSending.value = false
            currentRequestId.value = null // 清理请求 ID
            
            // 流式完成后滚动到底部
            scrollToBottom()
            break
        
        case 'ERROR':
            // 处理错误信息，支持不同类型的错误
            if (response.error) {
                window.finishThinkingProcess()
                
                // 判断错误类型并调用相应的中断处理
                const errorMessage = response.error
                
                // 处理流式传输中断
                if (isStreaming.value) {
                    handleStreamingInterrupt()
                } else {
                    // 非流式传输期间的错误
                    window.addMessage('ASSISTANT', errorMessage, 'error')
                }
            }
            isSending.value = false
            currentRequestId.value = null // 清理请求 ID
            break
            
        case 'CONNECTION_ACK':
            console.log('长连接已确认: ', response.portId)
            break
            
        case 'ELEMENT_SELECTED_RESULT':
            if (messageInputRef.value) {
                messageInputRef.value.resetElementSelector()
            }
            break
            
        default:
            // 兼容旧格式，统一处理
            window.finishThinkingProcess()
            const content = response.answer || response.content || response.error
            if (content) {
                const status = response.error ? 'error' : 'success'
                window.addMessage('ASSISTANT', content, status)
            } else {
                // 记录未知响应格式
                console.warn('收到未知格式的响应: ', response)
                window.addMessage('ASSISTANT', '收到未知格式的响应', 'error')
            }
            isSending.value = false
            currentRequestId.value = null // 清理请求 ID
    }
}

// 处理流式内容的实时拼接
const handleStreamingContent = (chunk: string, isFirstChunk: boolean) => {
    isStreaming.value = true
    
    if (isFirstChunk) {
        window.finishThinkingProcess()
        
        // 重置累积内容并创建新的 assistant 消息
        accumulatedContent.value = chunk
        
        currentStreamingMessage.value = {
            id: generateId(),
            type: 'ASSISTANT',
            content: accumulatedContent.value,
            timestamp: '', // 流式传输期间不显示时间戳
            status: 'success'
        }
        messages.push(currentStreamingMessage.value)
    } else if (currentStreamingMessage.value) {
        // 后续数据块，累积内容并更新消息
        accumulatedContent.value += chunk
        currentStreamingMessage.value.content = accumulatedContent.value
    } else {
        // 没有当前流式消息但收到非首个数据块，重新初始化
        console.warn('收到非首个数据块但没有当前流式消息，重新初始化')
        accumulatedContent.value = chunk
        
        currentStreamingMessage.value = {
            id: generateId(),
            type: 'ASSISTANT',
            content: accumulatedContent.value,
            timestamp: '',
            status: 'success'
        }
        messages.push(currentStreamingMessage.value)
    }
}

// 处理流式传输中断
const handleStreamingInterrupt = () => {
    isStreaming.value = false
    isSending.value = false
    
    if (currentStreamingMessage.value) {
        currentStreamingMessage.value.timestamp = getCurrentTimestamp()
        
        currentStreamingMessage.value = null
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
        if (!content || content.trim() === '') {
            showPopupMessage('没有可复制的内容', 'error')
            return
        }
        
        const textArea = document.createElement('textarea')
        textArea.value = content
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        
        const successful = document.execCommand('copy')
        document.body.removeChild(textArea)
        
        if (successful) {
            showPopupMessage('内容已复制到剪贴板', 'success')
        } else {
            throw new Error('复制命令执行失败')
        }
    } catch (error) {
        console.error('复制失败: ', error)
        showPopupMessage('复制失败，请手动复制', 'error')
    }
}

// 显示弹出提示
const showPopupMessage = (message: string, type: 'success' | 'error' = 'success') => {
    popupMessage.value = message
    popupType.value = type
    showPopup.value = true
    
    setTimeout(() => {
        const popupElement = document.querySelector('.popup') as HTMLElement
        if (popupElement) {
            popupElement.classList.add('hiding')
            
            setTimeout(() => {
                showPopup.value = false
                popupMessage.value = ''
                popupType.value = 'success'
            }, 400)
        } else {
            showPopup.value = false
            popupMessage.value = ''
            popupType.value = 'success'
        }
    }, 2500)
}

// 消息点击处理
const onMessageClick = (_messageId: number) => { }

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
        type: 'THINKING',
        content: '',
        timestamp: getCurrentTimestamp(),
        status: 'success',
        thinkingSteps: [thinkingStep]
    }
}

const shouldMergeThinking = (): boolean => {
    // 如果没有消息，不能合并
    if (messages.length === 0) return false
    
    // 检查最后一个消息是否为未完成的 THINKING 消息
    const lastMessage = messages[messages.length - 1]
    return lastMessage.type === 'THINKING' && lastMessage.completed !== true
}

window.addThinkingMessage = (content: string) => {
    const stepId = generateId()
    const newStep: ThinkingStep = {
        id: stepId,
        content,
        timestamp: getCurrentTimestamp()
    }
    
    if (shouldMergeThinking()) {
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
    if (lastMessage.type === 'THINKING' && lastMessage.completed !== true) {
        if (!lastMessage.thinkingSteps || lastMessage.thinkingSteps.length === 0) {
            messages.pop()
        } else {
            lastMessage.completed = true
        }
    }
}

window.addMessage = (type: 'USER' | 'ASSISTANT', content: string, status: 'success' | 'error' = 'success') => {
    const message: Message = {
        id: generateId(),
        type,
        content,
        timestamp: getCurrentTimestamp(),
        status
    }
    messages.push(message)
    
    return message.id
}

// API 密钥相关方法
const openApiKeySettings = async () => { showApiKeySettings.value = true }
const closeApiKeySettings = () => { showApiKeySettings.value = false }
const onApiKeySaved = () => {
    showPopupMessage('API 密钥保存成功', 'success')
    checkApiKeyStatus()
}
const onApiKeyCleared = () => {
    showPopupMessage('API 密钥已清空', 'success')
    checkApiKeyStatus()
}
const checkApiKeyStatus = async () => {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'GET_API_KEY'
        })
        
        if (response && response.status === 'success') {
            isApiKeyConfigured.value = response.configured || false
        } else {
            isApiKeyConfigured.value = false
        }
    } catch (error) {
        console.error('检查 API 密钥状态失败: ', error)
        isApiKeyConfigured.value = false
    }
}

onMounted(() => {
    window.addMessage('ASSISTANT', 
        '你好！我是AI开发者助手，可以帮你分析页面DOM结构、CSS样式、网络请求等。有什么问题尽管问我！',
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
.messages::-webkit-scrollbar {
    width: 8px;
}
.messages::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
}
.messages::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 4px;
}
.messages::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
}

/* 加载指示器样式 */
.loading-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #666;
    font-weight: 500;
}
.loading-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid #e0e0e0;
    border-top: 2px solid #007bff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
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
.popup.success {
    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
    color: white;
    border: 1px solid #28a745;
    box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);
}
.popup.success:hover {
    box-shadow: 0 6px 20px rgba(40, 167, 69, 0.4);
}
.popup.error {
    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
    color: white;
    border: 1px solid #dc3545;
    box-shadow: 0 4px 15px rgba(220, 53, 69, 0.3);
}
.popup.error:hover {
    box-shadow: 0 6px 20px rgba(220, 53, 69, 0.4);
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
.messages {
    scrollbar-width: thin;
    scrollbar-color: #c1c1c1 #f1f1f1;
}

</style>