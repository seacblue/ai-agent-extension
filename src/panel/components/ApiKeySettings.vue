<template>
  <div class="api-key-settings">
    <h3>API 密钥设置</h3>
    <div class="form-group">
      <label for="apiKey">豆包 AI API 密钥:</label>
      <input
        id="apiKey"
        v-model="apiKey"
        type="password"
        placeholder="请输入您的豆包 AI API 密钥"
        class="api-input"
      />
    </div>
    <div class="button-group">
      <button @click="saveApiKey" class="save-btn" :disabled="!apiKey.trim()">
        保存密钥
      </button>
      <button @click="checkApiKey" class="check-btn">
        检查状态
      </button>
    </div>
    <div v-if="message" :class="['message', messageType]">
      {{ message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const apiKey = ref('')
const message = ref('')
const messageType = ref<'success' | 'error' | 'info'>('info')

// 保存API密钥
const saveApiKey = async () => {
  if (!apiKey.value.trim()) {
    showMessage('请输入 API 密钥', 'error')
    return
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SET_API_KEY',
      apiKey: apiKey.value.trim()
    })

    if (response.type === 'success') {
      showMessage('API 密钥保存成功！', 'success')
    } else {
      showMessage(`保存失败: ${response.error}`, 'error')
    }
  } catch (error) {
    showMessage(`保存失败: ${error}`, 'error')
  }
}

// 检查API密钥状态
const checkApiKey = async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_API_KEY'
    })

    if (response.type === 'success') {
      if (response.hasApiKey) {
        showMessage('API 密钥已配置', 'success')
      } else {
        showMessage('API 密钥未配置', 'info')
      }
    } else {
      showMessage(`检查失败: ${response.error}`, 'error')
    }
  } catch (error) {
    showMessage(`检查失败: ${error}`, 'error')
  }
}

// 显示消息
const showMessage = (msg: string, type: 'success' | 'error' | 'info') => {
  message.value = msg
  messageType.value = type
  setTimeout(() => {
    message.value = ''
  }, 3000)
}
</script>

<style scoped>
.api-key-settings {
  padding: 20px;
  max-width: 400px;
  margin: 0 auto;
}

h3 {
  margin-bottom: 20px;
  color: #333;
  text-align: center;
}

.form-group {
  margin-bottom: 15px;
}

label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #555;
}

.api-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.api-input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.button-group {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.save-btn, .check-btn {
  flex: 1;
  padding: 10px 15px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.save-btn {
  background-color: #007bff;
  color: white;
}

.save-btn:hover:not(:disabled) {
  background-color: #0056b3;
}

.save-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.check-btn {
  background-color: #6c757d;
  color: white;
}

.check-btn:hover {
  background-color: #545b62;
}

.message {
  margin-top: 15px;
  padding: 10px;
  border-radius: 4px;
  text-align: center;
  font-size: 14px;
}

.message.success {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.message.error {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.message.info {
  background-color: #d1ecf1;
  color: #0c5460;
  border: 1px solid #bee5eb;
}
</style>