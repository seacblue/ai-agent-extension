<template>
  <div v-if="showPopup" class="popup" :class="popupType">
    {{ popupMessage }}
  </div>
</template>

<script setup lang="ts">
import { ref, defineExpose } from 'vue'

// 弹出消息状态
const showPopup = ref(false)
const popupMessage = ref('')
const popupType = ref<'success' | 'error'>('success')

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

// 暴露方法供父组件调用
defineExpose({
  showPopupMessage
})
</script>

<style scoped>
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
</style>