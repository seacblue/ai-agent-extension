<template>
  <div class="input-area">
    <!-- 元素信息显示区域 -->
    <div v-if="selectedElement" class="attachment-content">
      <div class="element-name">{{ MessageService.generateElementSummary(selectedElement.elementData) }}</div>
      <div class="element-tags">
        <span class="element-tag">{{ selectedElement.elementData.tagName }}</span>
        <span v-if="selectedElement.elementData.id" class="element-id">#{{ selectedElement.elementData.id }}</span>
        <span v-if="selectedElement.elementData.className" class="element-class">.{{ selectedElement.elementData.className.split(' ').join('.') }}</span>
      </div>
      <button class="attachment-remove" @click="removeSelectedElement">×</button>
    </div>
    
    <div class="input-wrapper">
      <textarea
        v-model="inputText"
        @input="handleInput"
        @keydown="handleKeyDown"
        placeholder="输入消息..."
        class="message-input"
        rows="1"
        ref="textareaRef"
      ></textarea>
      <button 
        @click="handleElementSelector" 
        :disabled="isSending || isSelectingElement" 
        class="selector-button"
        title="选择页面元素进行分析"
      >
        <div class="selector-icon">
          <img src="/icons/picker.png" alt="选择器" />
        </div>
      </button>
      <button @click="handleButtonClick" :disabled="!inputText.trim() && !isSending" class="send-button" :class="{ 'terminate-button': isSending }">
        <img :src="isSending ? '/icons/stop_thinking.png' : '/icons/send_message.png'" :alt="isSending ? '终止' : '发送'" class="send-icon" />
        <span>{{ isSending ? '终止' : '发送' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import { MessageService } from '../../shared/services/messageService'

const props = defineProps<{
  isSending: boolean
  selectedElement?: {
    id: string
    elementData: any
    timestamp: number
  } | null
}>()

const emit = defineEmits<{
  'send-message': []
  'terminate-message': []
  'element-selector': []
  'remove-element': []
}>()

const inputText = ref('')
const textareaRef = ref<HTMLTextAreaElement>()
const isSelectingElement = ref(false)

const handleButtonClick = () => {
  if (props.isSending) {
    emit('terminate-message')
  } else {
    emit('send-message')
  }
}

const handleElementSelector = () => {
  if (!props.isSending && !isSelectingElement.value) {
    isSelectingElement.value = true
    emit('element-selector')
  }
}

const removeSelectedElement = () => {
  emit('remove-element')
}

// 处理输入事件
const handleInput = () => {
  nextTick(() => {
    adjustTextareaHeight()
  })
}

// 处理键盘事件：Enter 发送，Shift+Enter 换行
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    if (event.shiftKey) {
      // Shift+Enter 换行
      event.preventDefault()
      const textarea = event.target as HTMLTextAreaElement
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const value = inputText.value
      
      // 在光标位置插入换行符
      inputText.value = value.substring(0, start) + '\n' + value.substring(end)
      
      // 恢复光标位置
      nextTick(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1
        adjustTextareaHeight()
      })
    } else {
      // Enter 发送消息
      event.preventDefault()
      if (!props.isSending && inputText.value.trim()) {
        emit('send-message')
      }
    }
  }
}

const adjustTextareaHeight = () => {
  const textarea = textareaRef.value
  if (!textarea) return
  
  // 简单的高度调整：重置高度，然后让自然高度决定
  textarea.style.height = 'auto'
  const scrollHeight = textarea.scrollHeight
  const minHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--textarea-min-height')) || 36
  const maxHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--textarea-max-height')) || 96
  
  // 应用限制后的高度
  const targetHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight)
  textarea.style.height = `${targetHeight}px`
}

watch(() => props.selectedElement, () => {
  nextTick(() => {
    adjustTextareaHeight()
  })
}, { immediate: true })

// 清空输入框
const clearInput = () => {
  inputText.value = ''
  adjustTextareaHeight()
}

// 获取输入框内容
const getInputText = () => inputText.value

// 重置元素选择状态
const resetElementSelector = () => {
  isSelectingElement.value = false
}

// 暴露方法给父组件
defineExpose({ clearInput, getInputText, resetElementSelector })
onMounted(() => { adjustTextareaHeight() })
</script>

<style scoped>
/* CSS 变量定义 */
:root {
  --textarea-min-height: 36px;
  --textarea-max-height: 96px;
  --send-button-height: 44px;
  --input-area-padding: 32px;
  --cursor-scroll-buffer: 32px;
}

/* 输入区域 */
.input-area {
  padding: 16px;
  border-top: 1px solid #e0e0e0;
  background: white;
  display: flex;
  flex-direction: column;
  gap: 0;
  align-items: stretch;
  position: relative;
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  position: relative;
  width: 100%;
}

.message-input {
  flex: 1;
  padding: 12px 12px;
  border: 2px solid #e9ecef;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.4;
  resize: none;
  outline: none;
  transition: all 0.3s ease;
  background: #f8f9fa;
  min-height: var(--textarea-min-height);
  max-height: var(--textarea-max-height);
  overflow-y: auto;
  font-family: inherit;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
  position: relative;
  display: block;
  width: 100%;
  box-sizing: border-box;
}

.message-input::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
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

.selector-button {
  padding: 0;
  background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease;
  box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
  height: 44px;
  width: 44px;
}

.selector-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s ease;
}

.selector-button:hover:not(:disabled)::before { 
  left: 100%; 
}

.selector-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(40, 167, 69, 0.4);
  background: linear-gradient(135deg, #218838 0%, #1ea085 100%);
}

.selector-button:active:not(:disabled) {
  transform: translateY(0);
}

.selector-button:disabled {
  background: #6c757d;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
  opacity: 0.8;
}

.send-button:disabled {
  background: #adb5bd;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.selector-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s ease;
}

.selector-icon img {
  width: 20px;
  height: 20px;
  filter: brightness(0) invert(1);
}

.element-selector-button:hover:not(:disabled) .selector-icon {
  transform: scale(1.1);
}

.send-button {
  padding: 12px 20px;
  background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease;
  box-shadow: 0 4px 15px rgba(0, 123, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
  height: var(--send-button-height);
  min-width: 80px;
}

.send-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s ease;
}

.send-button:hover:not(:disabled)::before { 
  left: 100%; 
}

.send-button.terminate-button {
  background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
  box-shadow: 0 4px 15px rgba(220, 53, 69, 0.3);
}

.send-button.terminate-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #c82333 0%, #bd2130 100%);
  box-shadow: 0 6px 20px rgba(220, 53, 69, 0.4);
}

/* 元素附件样式 */
.attachment-content {
  display: flex;
  align-items: center;
  margin: -4px 0 12px 0;
  padding: 8px 12px;
  width: 100%;
  height: 40px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  justify-content: space-between;
  background-clip: padding-box;
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}

.element-name {
  color: #333;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  max-width: 180px;
}

.element-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
  flex: 1;
  margin-top: 2px;
  margin-left: 8px;
}

.element-tag {
  background: #007bff;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}

.element-id {
  background: #28a745;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.element-class {
  background: #6c757d;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
  flex-shrink: 1;
}

.attachment-remove {
  background: none;
  border: none;
  border-radius: 4px;
  color: #666;
  font-size: 16px;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 20px;
  color: #6c757d;
  flex-shrink: 0;
  margin-left: 8px;
  transition: all 0.2s ease;
}

.attachment-remove:hover {
  background-color: #f0f0f0;
  color: #333;
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
  background: #adb5bd;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.send-button:disabled .send-icon {
  filter: brightness(0) invert(0.9) grayscale(0.3);
  opacity: 0.95;
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
</style>