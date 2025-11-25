<template>
  <div class="markdown-content" v-html="renderedContent"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface Props {
  content: string;
}

const props = defineProps<Props>();

// 配置 marked 选项
marked.setOptions({
  breaks: true,
  gfm: true,
});

// 自定义渲染器来处理 LaTeX
const renderer = new marked.Renderer();

// 处理代码块中的 LaTeX
renderer.code = ({
  text,
  lang,
}: {
  text: string;
  lang?: string;
  escaped?: boolean;
}) => {
  const code = text;
  const language = lang;
  if (language === 'latex' || language === 'math') {
    try {
      return katex.renderToString(code, {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return `<pre><code>${code}</code></pre>`;
    }
  }
  return `<pre><code class="language-${language || 'text'}">${code}</code></pre>`;
};

// 处理行内 LaTeX
const processInlineMath = (text: string): string => {
  // 先处理 $$...$$ 格式的块级数学公式（避免与 $...$ 冲突）
  text = text.replace(/\$\$([^$]+)\$\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula.trim(), {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return match;
    }
  });

  // 再处理 $...$ 格式的行内数学公式
  text = text.replace(/\$([^$\n]+)\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula.trim(), {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return match;
    }
  });

  return text;
};

marked.setOptions({ renderer });

const renderedContent = computed(() => {
  try {
    // 先处理 LaTeX 公式
    const processedContent = processInlineMath(props.content);
    // 然后渲染 Markdown
    return marked(processedContent);
  } catch (error) {
    console.error('Markdown 渲染错误: ', error);
    return props.content;
  }
});
</script>

<style scoped>
.markdown-content {
  line-height: 1.4;
  margin: 0;
  word-wrap: break-word;
}

.markdown-content * {
  margin: 0;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  margin-bottom: -0.3em;
  font-weight: 600;
}

.markdown-content :deep(h1) {
  font-size: 2em;
}
.markdown-content :deep(h2) {
  font-size: 1.6em;
}
.markdown-content :deep(h3) {
  font-size: 1.4em;
}
.markdown-content :deep(h4) {
  font-size: 1.2em;
}
.markdown-content :deep(h5) {
  font-size: 1.1em;
}
.markdown-content :deep(h6) {
  font-size: 1em;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin-top: -1em;
  margin-bottom: -1em;
  padding-left: 1.5em;
}
.markdown-content :deep(li) {
  margin-top: -0.4em;
  margin-bottom: -0.4em;
}

.markdown-content :deep(code) {
  background-color: #f1f3f4;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.9em;
}

.markdown-content :deep(pre) {
  background-color: #f6f8fa;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  padding: 16px;
  margin: 16px 0;
  overflow-x: auto;
  transform: translateY(-1em);
  margin-bottom: 0.4em;
}

.markdown-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
  border-radius: 0;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid #ddd;
  margin: 0.5em 0;
  padding-left: 1em;
  color: #666;
}

.markdown-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid #ddd;
  text-align: left;
}

.markdown-content :deep(th) {
  background-color: #f2f2f2;
  font-weight: 600;
}

.markdown-content :deep(a) {
  color: #007bff;
  text-decoration: none;
}
.markdown-content :deep(a:hover) {
  text-decoration: underline;
}
.markdown-content :deep(strong) {
  font-weight: 600;
}
.markdown-content :deep(em) {
  font-style: italic;
}

/* KaTeX样式调整 */
.markdown-content :deep(.katex) {
  font-size: 1em;
}
.markdown-content :deep(.katex-display) {
  text-align: center;
}

/* 块级公式容器样式 */
.markdown-content :deep(.katex-display .katex) {
  font-size: 1.1em;
}
/* 行内公式样式 */
.markdown-content :deep(.katex:not(.katex-display)) {
  font-size: 0.95em;
}
</style>
