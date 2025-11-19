<template>
  <div class="input-area">
    <div class="input-wrapper">
      <textarea 
        v-model="inputText" 
        @keydown="handleKeyDown"
        @input="handleInput"
        placeholder="输入问题，如：分析页面 DOM 结构..."
        class="message-input"
        rows="1"
        ref="textareaRef"
      ></textarea>
    </div>
    <button @click="handleButtonClick" :disabled="!inputText.trim() && !isSending" class="send-button" :class="{ 'terminate-button': isSending }">
      <img :src="isSending ? '/icons/stop_thinking.png' : '/icons/send_message.png'" :alt="isSending ? '终止' : '发送'" class="send-icon" />
      <span>{{ isSending ? '终止' : '发送' }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'

const props = defineProps<{
  isSending: boolean
}>()

const emit = defineEmits<{
  'send-message': []
  'terminate-message': []
}>()

const inputText = ref('')
const textareaRef = ref<HTMLTextAreaElement>()

const handleButtonClick = () => {
  if (props.isSending) {
    emit('terminate-message')
  } else {
    emit('send-message')
  }
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
  const inputWrapper = textareaRef.value?.parentElement as HTMLElement
  const inputArea = inputWrapper?.parentElement as HTMLElement
  if (!textarea || !inputWrapper || !inputArea) return
  
  // 获取 CSS 变量值
  const rootStyles = getComputedStyle(document.documentElement)
  const minHeight = parseInt(rootStyles.getPropertyValue('--textarea-min-height')) || 36
  const maxHeight = parseInt(rootStyles.getPropertyValue('--textarea-max-height')) || 96
  const sendButtonHeight = parseInt(rootStyles.getPropertyValue('--send-button-height')) || 44
  const inputAreaPadding = parseInt(rootStyles.getPropertyValue('--input-area-padding')) || 32
  const cursorBuffer = parseInt(rootStyles.getPropertyValue('--cursor-scroll-buffer')) || 30
  
  // 调试信息
  console.log('CSS Variables:', {
    minHeight,
    maxHeight,
    sendButtonHeight,
    inputAreaPadding,
    cursorBuffer
  })
  
  // 保存当前滚动位置和光标位置
  const scrollTop = textarea.scrollTop
  const cursorPosition = textarea.selectionStart
  textarea.style.height = 'auto'
  
  const naturalHeight = textarea.scrollHeight
  const targetHeight = Math.min(Math.max(naturalHeight, minHeight), maxHeight)
  if (targetHeight >= maxHeight) {
    textarea.classList.add('max-height')
  } else {
    textarea.classList.remove('max-height')
  }
  
  // 计算容器高度
  const wrapperHeight = Math.max(sendButtonHeight, targetHeight)
  const areaHeight = wrapperHeight + inputAreaPadding

  textarea.style.height = `${targetHeight}px`
  inputWrapper.style.height = `${wrapperHeight}px`
  inputArea.style.height = `${areaHeight}px`
  
  // 优化光标位置计算，只在需要时创建临时元素
  if (textarea.scrollHeight > textarea.clientHeight && cursorPosition > 0) {
    requestAnimationFrame(() => {
      // 创建临时元素来精确计算光标位置
      const temp = document.createElement('div')
      const style = getComputedStyle(textarea)
      temp.style.cssText = `
        position: absolute;
        visibility: hidden;
        white-space: pre-wrap;
        word-wrap: break-word;
        font-family: ${style.fontFamily};
        font-size: ${style.fontSize};
        line-height: ${style.lineHeight};
        padding: ${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft};
        width: ${textarea.clientWidth}px;
      `
      
      // 设置文本内容到光标位置
      temp.textContent = inputText.value.substring(0, cursorPosition)
      document.body.appendChild(temp)
      
      const cursorHeight = temp.offsetHeight
      document.body.removeChild(temp)
      
      // 计算需要的滚动位置
      const visibleHeight = textarea.clientHeight
      const targetScrollTop = Math.max(0, cursorHeight - visibleHeight + cursorBuffer)
      
      // 只有当需要滚动时才更新滚动位置
      if (cursorHeight > scrollTop + visibleHeight - cursorBuffer) {
        textarea.scrollTop = targetScrollTop
      } else {
        textarea.scrollTop = scrollTop
      }
    })
  }
}

// 清空输入框
const clearInput = () => {
  inputText.value = ''
  nextTick(() => {
    adjustTextareaHeight()
  })
}

// 获取输入框内容
const getInputText = () => inputText.value

// 暴露方法给父组件
defineExpose({ clearInput, getInputText })
onMounted(() => { adjustTextareaHeight() })
</script>

<style scoped>
/* CSS 变量定义 */
:root {
  --textarea-min-height: 36px;
  --textarea-max-height: 96px;
  --send-button-height: 44px;
  --input-area-padding: 32px;
  --cursor-scroll-buffer: 30px;
}

/* 输入区域 */
.input-area {
  padding: 16px;
  border-top: 1px solid #e0e0e0;
  background: white;
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-shrink: 0;
  position: relative;
}

.input-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  position: relative;
}

.message-input {
  padding: 12px 16px;
  border: 2px solid #e9ecef;
  border-radius: 25px;
  font-size: 14px;
  line-height: 1.4;
  resize: none;
  outline: none;
  transition: border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease;
  background: #f8f9fa;
  margin-bottom: 0;
  min-height: var(--textarea-min-height);
  max-height: var(--textarea-max-height);
  overflow-y: auto;
  overflow-x: hidden;
  font-family: inherit;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
  position: relative;
  bottom: 0;
  display: block;
  width: 100%;
  box-sizing: border-box;
}

.message-input.max-height {
  padding-top: 12px;
  padding-bottom: 12px;
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
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 0;
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