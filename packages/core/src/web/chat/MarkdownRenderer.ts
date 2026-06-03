import { escapeHtml } from "../dom";

const CODE_BLOCK_RE = /```(\w*)\n([\s\S]*?)```/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const BOLD_RE = /\*\*(.+?)\*\*/g;
const ITALIC_RE = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;
const LIST_RE = /^[-*] (.+)$/gm;
const BLOCKQUOTE_RE = /^&gt; (.+)$/gm;

let copyIdCounter = 0;

export function renderMarkdown(text: string): string {
  const codeBlocks: string[] = [];
  const withPlaceholders = extractCodeBlocks(text, codeBlocks);
  const escaped = escapeHtml(withPlaceholders);
  const formatted = applyInlineFormatting(escaped);
  return restoreCodeBlocks(formatted, codeBlocks);
}

function extractCodeBlocks(text: string, blocks: string[]): string {
  return text.replace(CODE_BLOCK_RE, (_match, lang: string, code: string) => {
    const escapedCode = escapeHtml(code.trimEnd());
    const langLabel = lang ? escapeHtml(lang) : "";
    const copyId = `code-copy-${++copyIdCounter}`;
    const header = langLabel
      ? `<div class="chat-code-header"><span>${langLabel}</span><button class="chat-code-copy" data-copy-code="${copyId}">Copy</button></div>`
      : `<div class="chat-code-header"><button class="chat-code-copy" data-copy-code="${copyId}">Copy</button></div>`;
    blocks.push(
      `<div class="chat-code-block">${header}<pre><code id="${copyId}">${escapedCode}</code></pre></div>`
    );
    return `%%CB_${blocks.length - 1}%%`;
  });
}

function applyInlineFormatting(html: string): string {
  let formatted = html;
  formatted = formatted.replace(INLINE_CODE_RE, '<code class="chat-inline-code">$1</code>');
  formatted = formatted.replace(BOLD_RE, "<strong>$1</strong>");
  formatted = formatted.replace(ITALIC_RE, "<em>$1</em>");
  formatted = formatted.replace(LIST_RE, '<div class="chat-list-item">• $1</div>');
  formatted = formatted.replace(BLOCKQUOTE_RE, '<div class="chat-blockquote">$1</div>');
  return formatted;
}

function restoreCodeBlocks(html: string, blocks: string[]): string {
  let restored = html;
  blocks.forEach((block, index) => {
    restored = restored.replace(`%%CB_${index}%%`, block);
  });
  return restored;
}

export function setupCodeCopyHandlers(container: HTMLElement): void {
  container.addEventListener("click", (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const copyButton = target.closest<HTMLElement>("[data-copy-code]");
    if (!copyButton) return;
    const codeId = copyButton.dataset.copyCode;
    if (!codeId) return;
    const codeElement = document.getElementById(codeId);
    if (!codeElement) return;
    void navigator.clipboard.writeText(codeElement.textContent ?? "");
    const originalText = copyButton.textContent;
    copyButton.textContent = "Copied!";
    setTimeout(() => {
      copyButton.textContent = originalText;
    }, 1500);
  });
}
