import { createApp } from 'vue';
import App from './App.vue';
import './styles/global.css';

const app = createApp(App);

try {
  app.mount('#app');
  console.log('Vue 应用挂载成功');
} catch (error) {
  console.error('Vue 应用挂载失败: ', error);
}
