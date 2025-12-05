<template>
  <!-- 普通消息（非FEEDBACK类型） -->
  <template v-if="message.type !== 'FEEDBACK'">
    <!-- 消息主体 -->
    <div :class="messageClasses" @click="onMessageClick(message.id)">
      <div class="message-background"></div>
      <div class="message-content-wrapper">
        <!-- 普通消息内容 -->
        <div v-if="message.type !== 'THINKING'" class="message-content">
          <!-- AI 助手消息使用 Markdown 渲染 -->
          <MarkdownRenderer
            v-if="message.type === 'ASSISTANT'"
            :content="message.content"
          />
          <!-- 用户消息直接显示 -->
          <span v-else>{{ message.content }}</span>
        </div>

        <!-- 思考过程消息 -->
        <div v-else class="thinking-content">
          <div class="thinking-steps">
            <div
              v-for="(step, index) in message.thinkingSteps"
              :key="step.id"
              class="thinking-step"
              :class="{
                'new-step': isNewStep(step.id),
                'thinking-complete':
                  message.completed === true &&
                  index === message.thinkingSteps!.length - 1,
              }"
            >
              <div class="step-content">{{ step.content }}</div>
            </div>
          </div>
          <div v-if="message.completed === false" class="thinking-progress">
            <span>思考进行中</span>
            <div class="progress-dots">
              <div class="progress-dot"></div>
              <div class="progress-dot"></div>
              <div class="progress-dot"></div>
            </div>
          </div>
        </div>

        <div v-if="message.type !== 'THINKING'" class="message-footer">
          <div v-if="message.type === 'USER'" class="message-time">
            {{ message.timestamp }}
          </div>

          <!-- 助手消息的操作按钮 -->
          <template v-if="message.type === 'ASSISTANT'">
            <!-- 复制按钮 -->
            <button
              class="copy-button"
              @click.stop="copyToClipboard(message.content)"
              :title="'复制'"
            >
              <img src="/icons/copy.png" alt="复制" class="copy-icon" />
            </button>

            <!-- 时间戳或加载指示器 -->
            <div class="message-time">
              <!-- 流式传输期间显示加载指示器，完成后显示时间戳 -->
              <div
                v-if="
                  isStreaming &&
                  currentStreamingMessage &&
                  currentStreamingMessage.id === message.id &&
                  !message.timestamp
                "
                class="loading-indicator"
              >
                <div class="loading-spinner"></div>
                <span>正在生成回复...</span>
              </div>
              <div v-else>{{ message.timestamp }}</div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 生成反馈选项的加载指示器 -->
    <template
      v-if="
        message.type === 'ASSISTANT' &&
        message.status === 'success' &&
        message.isGeneratingOptions === true
      "
    >
      <div class="thinking-progress feedback-progress">
        <span>生成反馈中</span>
        <div class="progress-dots">
          <div class="progress-dot"></div>
          <div class="progress-dot"></div>
          <div class="progress-dot"></div>
        </div>
      </div>
    </template>
  </template>

  <!-- FEEDBACK类型消息 - 只显示反馈选项，没有边框和其他内容 -->
  <template v-else>
    <template
      v-if="message.feedbackOptions && message.feedbackOptions.length > 0"
    >
      <div class="feedback-options">
        <button
          v-for="(option, index) in message.feedbackOptions"
          :key="option.id"
          class="feedback-option-button"
          :style="{ animationDelay: `${index * 100}ms` }"
          @click.stop="selectFeedbackOption(option.text)"
        >
          {{ option.text }}
        </button>
      </div>
    </template>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MarkdownRenderer from './markdownRenderer.vue';
import { Message } from '../../shared/types/chat';

// Props
interface Props {
  message: Message;
  newStepIds: Set<number>;
  isStreaming?: boolean;
  currentStreamingMessage?: Message | null;
}

const props = withDefaults(defineProps<Props>(), {
  isStreaming: false,
  currentStreamingMessage: null,
});

// Emits
const emit = defineEmits<{
  'message-click': [messageId: number];
  'copy-to-clipboard': [content: string];
  'retry-generation': [];
  'select-feedback-option': [optionText: string];
}>();

// 计算消息样式类
const messageClasses = computed(() => ({
  message: props.message.type,
  user: props.message.type === 'USER',
  assistant: props.message.type === 'ASSISTANT',
  thinking: props.message.type === 'THINKING',
  feedback: props.message.type === 'FEEDBACK',
  'status-success': props.message.status === 'success',
  'status-error': props.message.status === 'error',
}));

// 判断是否为新步骤
const isNewStep = (stepId: number): boolean => {
  return props.newStepIds.has(stepId);
};

// 消息点击处理
const onMessageClick = (messageId: number) => {
  emit('message-click', messageId);
};

// 复制到剪贴板功能
const copyToClipboard = async (content: string) => {
  emit('copy-to-clipboard', content);
};

// 选择反馈选项
const selectFeedbackOption = (optionText: string) => {
  emit('select-feedback-option', optionText);
};
</script>

<style scoped>
.message {
  margin-bottom: 12px;
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

.message:has(.feedback-options),
.message:has(.feedback-options-loading) {
  transition: none;
  cursor: default;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.message:has(.feedback-options):hover,
.message:has(.feedback-options-loading):hover {
  transform: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

/* 反馈消息样式 */
.feedback-message {
  color: #333;
  margin-right: auto;
  padding: 4px 16px;
  margin-bottom: 4px;
  max-width: 75%;
  position: relative;
  overflow: hidden;
  animation: slideIn 0.3s ease-out;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  cursor: default;
  transition: none;
  transform: none;
}

.feedback-message:hover {
  transform: translateY(2px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  filter: none;
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
.message.assistant {
  margin-right: auto;
}
.message.assistant.status-success {
  color: black;
}
.message.assistant.status-error {
  color: white;
}

.message.assistant.status-success .message-background {
  background: white;
}

.message.assistant.status-error {
  box-shadow: 0 2px 8px rgba(220, 53, 69, 0.2);
}
.message.assistant.status-error:hover {
  box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
}
.message.assistant.status-error .message-background {
  background: linear-gradient(135deg, #dc3545 0%, #fd7e14 100%);
}
.message.assistant.status-error:hover,
.message.assistant.status-error:hover .message-background {
  filter: brightness(0.85);
}

.message.assistant .markdown-content {
  margin-bottom: -20px;
}

/* 消息内容 */
.message-content {
  margin-bottom: 4px;
  line-height: 1.4;
  word-wrap: break-word;
  font-size: 15px;
  white-space: pre-line;
}

/* 消息底部容器 */
.message-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
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
.copy-icon {
  width: 14px;
  height: 14px;
  transition: filter 0.3s ease;
  opacity: 0.7;
}
.copy-button:hover .copy-icon {
  filter: brightness(0.7);
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
.message.user .message-time,
.message.assistant.status-error .message-time {
  color: rgba(255, 255, 255, 0.8);
}
.message.assistant .message-time {
  color: #666;
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

/* 思考状态 */
.message.thinking {
  color: #333;
  margin-right: auto;
  padding: 4px 16px;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  cursor: default;
  transition: none;
  transform: none;
  width: 100%;
  margin-bottom: 4px;
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
.message.thinking:active {
  transform: none;
}

/* 思考内容样式 */
.thinking-content {
  width: 100%;
  color: #9ca3af;
  font-size: 13px;
  line-height: 1.6;
  transition: all 0.3s ease;
}

/* 思考步骤样式 */
.thinking-steps {
  position: relative;
  padding-left: 0;
  transition: all 0.3s ease;
  margin-bottom: 2px;
}

.thinking-step {
  position: relative;
  margin-bottom: -2px;
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
  margin-top: 4px;
  margin-left: -8px;
  padding: 3px 0 3px 8px;
  background-color: #f9fafb;
  border-radius: 4px;
  font-size: 11px;
  color: #9ca3af;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 反馈生成进度指示器 */
.feedback-progress {
  margin-left: 8px;
  margin-bottom: 8px;
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
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

/* 反馈选项样式 */
.feedback-options-loading {
  display: none;
}

.feedback-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  margin-bottom: 16px;
  padding: 0;
  background: transparent;
  animation: fadeIn 0.3s ease-out;
  max-width: 75%;
}

.feedback-option-button {
  padding: 8px 16px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  opacity: 0;
  transform: translateX(-10px);
  animation: optionSlideIn 0.4s ease-out forwards;
  white-space: normal;
  width: 100%;
  max-width: 100%;
  text-align: left;
}

.feedback-option-button:hover {
  background: #f0f7ff;
  color: #0056b3;
  border-color: #b3d7ff;
  box-shadow: 0 3px 10px rgba(0, 123, 255, 0.15);
  transform: translateY(-1px) translateX(0);
}

.feedback-option-button:active {
  transform: translateY(0) translateX(0) scale(1.04);
  box-shadow: 0 1px 6px rgba(0, 123, 255, 0.2);
  transition: all 0.1s ease;
}

@keyframes optionSlideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
