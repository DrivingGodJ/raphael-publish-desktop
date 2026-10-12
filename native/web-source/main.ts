import { md, preprocessMarkdown, applyTheme } from '../../src/lib/markdown';
import { htmlToMarkdown } from '../../src/lib/htmlToMarkdown';
import { THEMES } from '../../src/lib/themes';
import { markElementIndexes } from '../../src/lib/markdownIndexer';
import { findElementPosition } from '../../src/lib/markdownLocator';
import { findImagePosition } from '../../src/lib/imageSelector';
import { resolveProjectAssets, restoreProjectAssetPath } from '../../src/lib/projectAssets';
import { makeWeChatCompatible, cleanInternalAttributes } from '../../src/lib/wechatCompat';
import './style.css';

declare global {
    interface Window { chrome?: { webview?: { postMessage: (data: unknown) => void; addEventListener: (type: string, callback: (event: MessageEvent) => void) => void } }; }
}
const article = document.getElementById('article')!;
let markdown = '', themeId = 'apple', projectId = '', renderedHtml = '';
const send = (data: unknown) => window.chrome?.webview?.postMessage(data);

function safeHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,iframe,object,embed,base,link,meta,form,input,button').forEach(node => node.remove());
    doc.querySelectorAll('*').forEach(node => {
        Array.from(node.attributes).forEach(attribute => {
            if (/^on/i.test(attribute.name) || (/^(href|src|action)$/i.test(attribute.name) && /^\s*(javascript|vbscript):/i.test(attribute.value))) node.removeAttribute(attribute.name);
        });
    });
    return doc.body.innerHTML;
}

function render(payload: { markdown: string; themeId?: string; projectId?: string }) {
    const ratio = document.documentElement.scrollTop / Math.max(1, document.documentElement.scrollHeight - innerHeight);
    markdown = payload.markdown;
    themeId = payload.themeId || 'apple';
    projectId = payload.projectId || '';
    const resolved = resolveProjectAssets(markdown, projectId).replaceAll('raphael-asset://project/', 'https://images.raphael.local/');
    renderedHtml = markElementIndexes(safeHtml(applyTheme(md.render(preprocessMarkdown(resolved)), themeId)));
    article.innerHTML = renderedHtml;
    window.scrollTo(0, ratio * Math.max(0, document.documentElement.scrollHeight - innerHeight));
    return { words: article.innerText.replace(/\s/g, '').length, themes: THEMES.length };
}

async function handle(method: string, payload: any) {
    if (method === 'themes') return THEMES.map(({ id, name, description }) => ({ id, name, description }));
    if (method === 'render') return render(payload);
    if (method === 'paste') {
        if (payload.html && !(/^\s*<(?:pre|code)[\s>]/i.test(payload.html) && !/<p[\s>]/i.test(payload.html))) {
            return htmlToMarkdown(payload.html, payload.flowUsBlocks || '');
        }
        return payload.text || '';
    }
    if (method === 'html' || method === 'copy' || method === 'publish') {
        const html = cleanInternalAttributes(await makeWeChatCompatible(renderedHtml, themeId, {
            imageMode: method === 'publish' ? 'preserve' : 'base64', profile: method === 'publish' ? 'publish' : 'copy',
        }));
        return { html, text: article.innerText };
    }
    if (method === 'plain') return article.innerText;
    if (method === 'view') {
        document.body.dataset.device = payload.device || 'pc';
        document.documentElement.classList.toggle('dark', Boolean(payload.dark));
        return true;
    }
    if (method === 'scroll') {
        window.scrollTo(0, payload.ratio * Math.max(0, document.documentElement.scrollHeight - innerHeight));
        return true;
    }
    if (method === 'print') { document.body.classList.toggle('printing', Boolean(payload.enabled)); return true; }
    if (method === 'inspect') return { text: article.innerText, html: article.innerHTML, themeId, projectId, device: document.body.dataset.device, scrollRatio: document.documentElement.scrollTop / Math.max(1, document.documentElement.scrollHeight - innerHeight) };
    if (method === 'testClick') { (article.querySelector('p') as HTMLElement | null)?.click(); return true; }
    throw new Error('未知的排版操作');
}

window.chrome?.webview?.addEventListener('message', async event => {
    const { id, method, payload } = event.data;
    try { send({ type: 'response', id, result: await handle(method, payload || {}) }); }
    catch (error) { send({ type: 'response', id, error: error instanceof Error ? error.message : String(error) }); }
});

article.addEventListener('click', event => {
    const target = (event.target as Element).closest('[data-md-type]') as HTMLElement | null;
    if ((event.target as Element).closest('a')) event.preventDefault();
    if (!target) return;
    const type = target.dataset.mdType || '';
    const src = target.getAttribute('src') || '';
    const original = restoreProjectAssetPath(src.replace('https://images.raphael.local/', 'raphael-asset://project/'), projectId);
    const position = type === 'image'
        ? findImagePosition(markdown, original, target.getAttribute('alt') || '')
        : findElementPosition(markdown, type, '', Number(target.dataset.mdIndex));
    if (position) send({ type: 'select', start: position.start, length: position.end - position.start });
});
window.addEventListener('scroll', () => {
    send({ type: 'scroll', ratio: document.documentElement.scrollTop / Math.max(1, document.documentElement.scrollHeight - innerHeight) });
}, { passive: true });
send({ type: 'ready' });

// The browser-only test harness exercises the same adapter without native UI.
(window as any).raphaelTest = { handle, render };
