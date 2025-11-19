<template>
  <transition name="modal" appear>
    <div v-if="visible" class="settings-modal" 
      @mousedown="onModalMouseDown"
      @mouseup="onModalMouseUp">
      <transition name="modal-content" appear>
        <div class="settings-content" @mousedown.stop @click.stop>
          <div class="settings-header">
            <h3>API 密钥设置</h3>
            <button class="close-button" @mousedown="onCloseButtonClick">×</button>
          </div>
          <div class="settings-body">
            <div class="api-key-section">
              <label for="apiKey">豆包 AI API KEY：</label>
              <div class="input-group">
                <input 
                  id="apiKey"
                  v-model="apiKeyInput" 
                  type="password" 
                  placeholder="请输入您的豆包 AI API KEY"
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
              <button class="save-button"
                :disabled="!apiKeyInput.trim()" 
                @click="saveApiKey">
                保存密钥
              </button>
              <button class="clear-button" 
                :disabled="!isApiKeyConfigured"
                @click="clearApiKey">
                清空 API KEY
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

// Props
interface Props {
  visible: boolean
  isApiKeyConfigured: boolean
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  close: []
  saveApiKey: [apiKey: string]
  clearApiKey: []
}>()

// Local state
const apiKeyInput = ref('')
const showApiKey = ref(false)
const mouseDownTarget = ref<EventTarget | null>(null)

// Watch for modal visibility changes
watch(() => props.visible, (newVal) => {
  if (newVal) {
    loadApiKey()
  }
})

// Load existing API key
const loadApiKey = async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_API_KEY'
    })
    
    if (response.type === 'success' && response.apiKey) {
      apiKeyInput.value = response.apiKey
    }
  } catch (error) {
    console.error('加载 API 密钥失败: ', error)
  }
}

// Toggle API key visibility
const toggleApiKeyVisibility = () => {
  const input = document.getElementById('apiKey') as HTMLInputElement
  if (input) {
    showApiKey.value = !showApiKey.value
    input.type = showApiKey.value ? 'text' : 'password'
  }
}

// Save API key
const saveApiKey = async () => {
  if (!apiKeyInput.value.trim()) return
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SET_API_KEY',
      apiKey: apiKeyInput.value.trim()
    })
    
    if (response.type === 'success') {
      emit('saveApiKey', apiKeyInput.value.trim())
    } else {
      console.error('保存 API 密钥失败: ', response.error)
    }
  } catch (error) {
    console.error('保存 API 密钥失败: ', error)
  }
}

// Clear API key
const clearApiKey = async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CLEAR_API_KEY'
    })
    
    if (response.type === 'success') {
      apiKeyInput.value = ''
      emit('clearApiKey')
    } else {
      console.error('清空 API 密钥失败: ', response.error)
    }
  } catch (error) {
    console.error('清空 API 密钥失败: ', error)
  }
}

// Modal interaction handlers
const onModalMouseDown = (event: MouseEvent) => {
  mouseDownTarget.value = event.target
}

const onModalMouseUp = (event: MouseEvent) => {
  if (mouseDownTarget.value === event.currentTarget) {
    closeModal()
  }
  mouseDownTarget.value = null
}

const onCloseButtonClick = (event: MouseEvent) => {
  event.stopPropagation() // 防止事件冒泡到背景
  closeModal()
}

const closeModal = () => {
  // 触发关闭事件，让Vue transition处理动画
  emit('close')
}

// 监听visible变化，在模态框完全隐藏后重置状态
watch(() => props.visible, (newVal) => {
  if (!newVal) {
    // 模态框关闭后重置相关状态
    showApiKey.value = false
  }
})
</script>

<style scoped>
/* 模态框背景动画 */
.modal-enter-active { transition: all 0.3s ease; }
.modal-leave-active { transition: all 0.3s ease; }
.modal-enter-from { background-color: rgba(0, 0, 0, 0); opacity: 0; }
.modal-leave-to { background-color: rgba(0, 0, 0, 0); opacity: 0; }

/* 模态框内容动画 */
.modal-content-enter-active { transition: all 0.3s ease; }
.modal-content-leave-active { transition: all 0.3s ease; }
.modal-content-enter-from { transform: scale(0.7); opacity: 0; }
.modal-content-leave-to { transform: scale(0.7); opacity: 0; }

.settings-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.settings-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 24px 20px 24px;
  border-bottom: 1px solid #e8e8e8;
  background: #fafafa;
}

.settings-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.close-button {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-button:hover {
  background-color: #f0f0f0;
  color: #333;
}

.settings-body {
  padding: 24px;
}

.api-key-section {
  margin-bottom: 24px;
}

.api-key-section label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #333;
  font-size: 14px;
}

.input-group {
  position: relative;
  display: flex;
  align-items: center;
}

.api-key-input {
  flex: 1;
  padding: 12px 45px 12px 16px;
  border: 2px solid #e9ecef;
  border-radius: 25px;
  font-size: 14px;
  transition: all 0.3s ease;
  background: #f8f9fa;
  outline: none;
}

.api-key-input:focus {
  border-color: #007bff;
  background: white;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}

.api-key-input.has-value:focus {
  border-color: #007bff;
  background: white;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}

.api-key-input.has-value {
  background-color: white;
  border-color: #d0d0d0;
}

.toggle-visibility {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
}

.toggle-visibility:hover {
  background-color: #f0f0f0;
}

.toggle-icon {
  width: 20px;
  height: 20px;
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.toggle-visibility:hover .toggle-icon {
  opacity: 1;
}

.settings-actions {
  display: flex;
  gap: 12px;
}

.save-button, .clear-button {
  flex: 1;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.save-button {
  background-color: #f8f9fa;
  color: #333;
  border: 1px solid #dee2e6;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.save-button:not(:disabled) {
  background-color: #0056b3;
  color: white;
  border-color: #0056b3;
  box-shadow: 0 2px 8px rgba(0, 123, 255, 0.4);
}
.save-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.1), transparent);
  transition: left 0.5s ease;
}
.save-button:hover:not(:disabled)::before { left: 100%; }
.save-button:hover:not(:disabled) {
  background-color: #004085;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.4);
}
.save-button:active:not(:disabled) { transform: translateY(0);}

.clear-button {
  background-color: #f8f9fa;
  color: #333;
  border: 1px solid #dee2e6;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.clear-button:not(:disabled) {
  background-color: #dc3545;
  color: white;
  border-color: #dc3545;
  box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3);
}
.clear-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.1), transparent);
  transition: left 0.5s ease;
}
.clear-button:hover:not(:disabled)::before { left: 100%; }
.clear-button:hover:not(:disabled) {
  background-color: #c82333;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(220, 53, 69, 0.4);
}
.clear-button:active:not(:disabled) { transform: translateY(0);}
</style>