<template>
  <div class="ai-assistant">
    <PopupMessage ref="popupMessageRef" />

    <header class="assistant-header">
      <div class="header-content">
        <div class="header-text">
          <h2>AI 开发者助手</h2>
          <p>分析 DOM、CSS、网络请求，获取优化建议</p>
        </div>
        <button class="settings-button" @click="openApiKeySettings">
          <img src="/icons/setting.png" alt="设置" class="settings-icon" />
        </button>
      </div>
    </header>

    <main class="assistant-main">
      <div class="chat-container">
        <div class="messages" ref="messagesRef">
          <MessageItem
            v-for="message in messages"
            :key="message.id"
            :message="message"
            :new-step-ids="newStepIds"
            :is-streaming="isStreaming"
            :current-streaming-message="currentStreamingMessage"
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
import { ref, reactive, onMounted, nextTick } from 'vue';
import { generateId } from '../shared/utils';
import { MessageService } from '../shared/services/messageService';
import { Message, ElementInfo } from '../shared/types/chat';

import MessageItem from './components/messageItem.vue';
import MessageInput from './components/messageInput.vue';
import ApiKeyModal from './components/apiKeyModal.vue';
import PopupMessage from './components/popupMessage.vue';

const messageInputRef = ref<InstanceType<typeof MessageInput>>();
const messages = reactive<Message[]>([]);
const messagesRef = ref<HTMLElement>();
const popupMessageRef = ref();
const newStepIds = ref<Set<number>>(new Set());
const isSending = ref(false);

// API 密钥设置相关
const showApiKeySettings = ref(false);
const isApiKeyConfigured = ref(false);

// 流式内容处理相关
const currentStreamingMessage = ref<Message | null>(null);
const isStreaming = ref(false);

// 消息服务实例
const messageService = new MessageService({
  onMessageAdded: message => {
    // 处理思考完成的特殊消息
    if (
      message.type === 'THINKING' &&
      message.completed === true &&
      message.thinkingSteps &&
      message.thinkingSteps.length === 0
    ) {
      // 查找并更新最后一条思考消息
      if (messages.length > 0) {
        const lastMessageIndex = [...messages]
          .reverse()
          .findIndex(m => m.type === 'THINKING');
        const actualIndex =
          lastMessageIndex !== -1 ? messages.length - 1 - lastMessageIndex : -1;
        if (actualIndex !== -1) {
          if (
            !messages[actualIndex].thinkingSteps ||
            messages[actualIndex].thinkingSteps.length === 0
          ) {
            // 移除没有思考步骤的思考消息
            messages.splice(actualIndex, 1);
          } else {
            // 标记有思考步骤的消息为已完成
            messages[actualIndex].completed = true;
          }
        }
        return;
      }
    }
    messages.push(message);
    nextTick(() => scrollToBottom());
  },
  onStreamingStarted: () => {
    isStreaming.value = true;
    currentStreamingMessage.value = messageService.currentStreamingMessage;
  },
  onStreamingUpdated: content => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.type === 'ASSISTANT') {
        lastMessage.content = content;
      }
    }
    if (messageService.currentStreamingMessage) {
      currentStreamingMessage.value = {
        ...messageService.currentStreamingMessage,
      };
    }
  },
  onStreamingComplete: () => {
    isSending.value = false;
    isStreaming.value = false;
    currentStreamingMessage.value = null;
    nextTick(() => scrollToBottom());
  },
  onError: error => {
    isSending.value = false;
    console.log(error);
  },
});

// 元素信息存储
const selectedElement = ref<ElementInfo | null>(null);

const removeSelectedElement = () => {
  selectedElement.value = null;
};
const sendMessage = async () => {
  if (!messageInputRef.value?.getInputText().trim()) return;
  const userInputText = messageInputRef.value.getInputText();
  messageInputRef.value.clearInput();
  await messageService.sendMessage(
    userInputText,
    selectedElement.value,
    sending => {
      isSending.value = sending;
    }
  );
};

const terminateMessage = async () => {
  await messageService.terminateMessage(sending => {
    isSending.value = sending;
  });
};

// 处理元素选择器
const handleElementSelector = () => {
  console.log('启动元素选择器');

  try {
    // 获取当前标签页 ID
    let tabId: number | null = null;

    if (chrome.devtools && chrome.devtools.inspectedWindow) {
      tabId = chrome.devtools.inspectedWindow.tabId;
      console.log('获取到标签页 ID: ', tabId);
    } else {
      console.error('无法获取标签页 ID');
      showPopupMessage('无法获取当前页面信息', 'error');
      return;
    }

    // 向 Content Script 发送启动元素选择器的消息
    chrome.tabs.sendMessage(
      tabId,
      {
        type: 'START_ELEMENT_SELECTOR',
        requestId: generateId().toString(),
      },
      response => {
        if (chrome.runtime.lastError) {
          console.log(
            'Content Script 可能未加载，尝试通过 Background 启动: ',
            chrome.runtime.lastError.message
          );
          // 如果直接发送到 Content Script 失败，尝试通过 Background
          chrome.runtime.sendMessage(
            {
              type: 'START_ELEMENT_SELECTOR',
              requestId: generateId().toString(),
            },
            bgResponse => {
              if (chrome.runtime.lastError) {
                console.error(
                  '通过 Background 启动元素选择器也失败: ',
                  chrome.runtime.lastError.message
                );
                showPopupMessage('启动元素选择器失败，请刷新页面重试', 'error');
                return;
              }

              if (!bgResponse || !bgResponse.success) {
                console.error(
                  '通过 Background 启动元素选择器失败: ',
                  bgResponse?.error
                );
                showPopupMessage(
                  `启动失败: ${bgResponse?.error || '未知错误'}`,
                  'error'
                );
              }
            }
          );
          return;
        }

        if (!response || response.type !== 'success') {
          console.error('元素选择器启动失败: ', response?.message);
          showPopupMessage(
            `启动失败: ${response?.message || '未知错误'}`,
            'error'
          );
        }
      }
    );
  } catch (error) {
    console.error('处理元素选择器时发生错误: ', error);
    showPopupMessage('启动元素选择器失败', 'error');
  }
};

// 滚动到底部函数
const scrollToBottom = async () => {
  await nextTick();
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
  }
};

// 复制到剪贴板功能
const copyToClipboard = async (content: string) => {
  try {
    if (!content || content.trim() === '') {
      showPopupMessage('没有可复制的内容', 'error');
      return;
    }

    const textArea = document.createElement('textarea');
    textArea.value = content;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (successful) {
      showPopupMessage('内容已复制到剪贴板', 'success');
    } else {
      throw new Error('复制命令执行失败');
    }
  } catch (error) {
    console.error('复制失败: ', error);
    showPopupMessage('复制失败，请手动复制', 'error');
  }
};

// 使用组件方法显示弹出提示
const showPopupMessage = (
  message: string,
  type: 'success' | 'error' = 'success'
) => {
  if (popupMessageRef.value) {
    popupMessageRef.value.showPopupMessage(message, type);
  }
};
const openApiKeySettings = async () => {
  showApiKeySettings.value = true;
};
const closeApiKeySettings = () => {
  showApiKeySettings.value = false;
};
const onApiKeySaved = () => {
  showPopupMessage('API 密钥保存成功', 'success');
  checkApiKeyStatus();
};
const onApiKeyCleared = () => {
  showPopupMessage('API 密钥已清空', 'success');
  checkApiKeyStatus();
};
const checkApiKeyStatus = async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_API_KEY',
    });

    if (response && response.status === 'success') {
      isApiKeyConfigured.value = response.configured || false;
    } else {
      isApiKeyConfigured.value = false;
    }
  } catch (error) {
    console.error('检查 API 密钥状态失败: ', error);
    isApiKeyConfigured.value = false;
  }
};

onMounted(() => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'ELEMENT_SELECTED_RESULT') {
      console.log('Panel 收到消息: ', message.type);
      console.log('收到元素选择结果: ', message.elementData);
      // 存储元素信息
      selectedElement.value = {
        id: generateId().toString(),
        elementData: message.elementData,
        timestamp: Date.now(),
      };
      console.log('元素信息已存储: ', selectedElement.value);
      if (messageInputRef.value) {
        messageInputRef.value.resetElementSelector();
      }
      sendResponse({ success: true });
      return false; // 同步响应，不需要保持通道开放
    } else {
      if (message?.type === 'ELEMENT_SELECTED_RESULT') {
        if (messageInputRef.value) {
          messageInputRef.value.resetElementSelector();
        }
        sendResponse({ success: true });
        return false;
      }
      messageService.handleBackgroundResponse(message);
      sendResponse({ success: true, handledByMessageService: true });
      return false; // 不需要保持通道开放，因为长连接用于异步通信
    }
  });

  checkApiKeyStatus();
  scrollToBottom();
});
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
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
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
