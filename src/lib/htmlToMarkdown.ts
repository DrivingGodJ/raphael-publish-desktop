import TurndownService from 'turndown';
// @ts-ignore
import { gfm } from 'turndown-plugin-gfm';

const turndownService = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined'
});

turndownService.use(gfm);

const FLOWUS_BLOCKS_MIME = 'text/next-space-blocks';
const FLOWUS_CALLOUT_BLOCK_TYPE = 13;

interface FlowUsRootBlock {
    type: number;
    title: string;
}

function parseFlowUsRootBlocks(rawData: string): FlowUsRootBlock[] {
    if (!rawData) return [];
    try {
        const payload = JSON.parse(rawData) as {
            blocks?: Array<{
                id?: string;
                subTree?: Record<string, { type?: number; title?: string }>;
            }>;
        };
        return (payload.blocks || []).flatMap((root) => {
            if (!root.id || !root.subTree?.[root.id]) return [];
            const block = root.subTree[root.id];
            return [{ type: Number(block.type), title: String(block.title || '') }];
        });
    } catch {
        return [];
    }
}

function wrapElementAsBlockquote(element: Element, document: Document) {
    if (
        element.tagName.toLowerCase() === 'blockquote'
        || element.closest('blockquote')
        || element.querySelector('blockquote')
    ) return;
    const blockquote = document.createElement('blockquote');
    element.replaceWith(blockquote);
    blockquote.appendChild(element);
}

function collapseNestedBlockquotes(body: HTMLElement) {
    Array.from(body.querySelectorAll('blockquote blockquote')).forEach((nestedQuote) => {
        nestedQuote.replaceWith(...Array.from(nestedQuote.childNodes));
    });
}

function serializeFlowUsHtml(body: HTMLElement): string {
    collapseNestedBlockquotes(body);
    return body.innerHTML;
}

function findFlowUsBlockContainer(body: HTMLElement, blockCount: number): HTMLElement | null {
    let container: HTMLElement = body;
    while (container.children.length === 1) {
        const onlyChild = container.children[0];
        if (!(onlyChild instanceof HTMLElement) || onlyChild.children.length < blockCount) break;
        container = onlyChild;
    }
    return container.children.length === blockCount ? container : null;
}

function normalizeBlockText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function restoreFlowUsCallouts(html: string, flowUsBlocksData: string): string {
    const rootBlocks = parseFlowUsRootBlocks(flowUsBlocksData);
    if (!rootBlocks.some(block => block.type === FLOWUS_CALLOUT_BLOCK_TYPE)) return html;

    const parser = new DOMParser();
    const document = parser.parseFromString(html, 'text/html');
    const body = document.body;

    if (rootBlocks.length === 1 && rootBlocks[0].type === FLOWUS_CALLOUT_BLOCK_TYPE) {
        if (body.children.length === 1 && body.children[0].tagName.toLowerCase() === 'blockquote') {
            return serializeFlowUsHtml(body);
        }
        const blockquote = document.createElement('blockquote');
        while (body.firstChild) blockquote.appendChild(body.firstChild);
        body.appendChild(blockquote);
        return serializeFlowUsHtml(body);
    }

    const container = findFlowUsBlockContainer(body, rootBlocks.length);
    if (container) {
        const elements = Array.from(container.children);
        rootBlocks.forEach((block, index) => {
            if (block.type === FLOWUS_CALLOUT_BLOCK_TYPE && elements[index]) {
                wrapElementAsBlockquote(elements[index], document);
            }
        });
        return serializeFlowUsHtml(body);
    }

    for (const block of rootBlocks) {
        if (block.type !== FLOWUS_CALLOUT_BLOCK_TYPE) continue;
        const expectedText = normalizeBlockText(block.title);
        if (!expectedText) continue;
        const candidates = Array.from(body.querySelectorAll('p, div, section, aside'))
            .filter(element => normalizeBlockText(element.textContent || '') === expectedText)
            .sort((left, right) => left.children.length - right.children.length);
        if (candidates[0]) wrapElementAsBlockquote(candidates[0], document);
    }

    return serializeFlowUsHtml(body);
}

function collapseDuplicateFlowUsQuoteMarkers(markdown: string, flowUsBlocksData: string): string {
    const hasFlowUsCallout = parseFlowUsRootBlocks(flowUsBlocksData)
        .some(block => block.type === FLOWUS_CALLOUT_BLOCK_TYPE);
    if (!hasFlowUsCallout) return markdown;

    return markdown.replace(/^(?:[ \t]*>\s*){2,}/gm, '> ');
}

// Rule to optimize images
turndownService.addRule('image', {
    filter: 'img',
    replacement: (_content, node: any) => {
        const alt = node.alt || '图片';
        const src = (node.getAttribute?.('src') || node.src || '').trim();
        const title = (node.title || '').replace(/"/g, '\\"');

        if (!src) return '';

        // Preserve full data URLs. Truncating them produces broken pasted images.
        return `![${alt}](${src}${title ? ` "${title}"` : ''})\n`;
    }
});

function isIDEFormattedHTML(htmlData: string, textData: string): boolean {
    if (!htmlData || !textData) return false;

    const ideSignatures = [
        /<meta\s+charset=['"]utf-8['"]/i,
        /<div\s+class=["']ace_line["']/,
        /style=["'][^"']*font-family:\s*['"]?(?:Consolas|Monaco|Menlo|Courier)/i,
        (html: string) => {
            const hasDivSpan = /<(?:div|span)[\s>]/.test(html);
            const hasSemanticTags = /<(?:p|h[1-6]|strong|em|ul|ol|li|blockquote)[\s>]/i.test(html);
            return hasDivSpan && !hasSemanticTags;
        },
        (html: string) => {
            const strippedHtml = html.replace(/<[^>]+>/g, '').trim();
            return strippedHtml === textData.trim();
        }
    ];

    let matchCount = 0;
    for (const signature of ideSignatures) {
        if (typeof signature === 'function') {
            if (signature(htmlData)) matchCount++;
        } else if (signature.test(htmlData)) {
            matchCount++;
        }
    }
    return matchCount >= 2;
}

function isMarkdown(text: string): boolean {
    if (!text) return false;
    const patterns = [
        /^#{1,6}\s+/m,
        /\*\*[^*]+\*\*/,
        /\*[^*\n]+\*/,
        /\[[^\]]+\]\([^)]+\)/,
        /!\[[^\]]*\]\([^)]+\)/,
        /^[\*\-\+]\s+/m,
        /^\d+\.\s+/m,
        /^>\s+/m,
        /`[^`]+`/,
        /```[\s\S]*?```/,
        /^\|.*\|$/m,
        /<!--.*?-->/,
        /^---+$/m
    ];
    return patterns.filter(pattern => pattern.test(text)).length >= 2;
}

function getClipboardImageFiles(clipboardData: DataTransfer): File[] {
    const fromItems = Array.from(clipboardData.items || [])
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));

    if (fromItems.length > 0) return fromItems;

    return Array.from(clipboardData.files || []).filter((file) => file.type.startsWith('image/'));
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read clipboard image'));
        reader.readAsDataURL(file);
    });
}

export function htmlToMarkdown(html: string, flowUsBlocksData = ''): string {
    const semanticHtml = restoreFlowUsCallouts(html, flowUsBlocksData);
    const markdown = turndownService.turndown(semanticHtml).replace(/\n{3,}/g, '\n\n');
    return collapseDuplicateFlowUsQuoteMarkers(markdown, flowUsBlocksData);
}

export function insertAtSelection(
    textarea: HTMLTextAreaElement,
    insertedText: string,
    setMarkdownInput: (val: string) => void
) {
    const currentValue = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = currentValue.substring(0, start) + insertedText + currentValue.substring(end);
    setMarkdownInput(newValue);

    setTimeout(() => {
        const nextPos = start + insertedText.length;
        textarea.selectionStart = textarea.selectionEnd = nextPos;
        textarea.focus();
    }, 0);
}

export function handleSmartPaste(
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    setMarkdownInput: (val: string) => void
): void {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const htmlData = clipboardData.getData('text/html');
    const textData = clipboardData.getData('text/plain');
    const flowUsBlocksData = clipboardData.getData(FLOWUS_BLOCKS_MIME);
    const imageFiles = getClipboardImageFiles(clipboardData);

    if (imageFiles.length > 0) {
        e.preventDefault();
        const textarea = e.currentTarget;

        Promise.all(imageFiles.map(fileToDataUrl))
            .then((dataUrls) => {
                const markdownImages = dataUrls
                    .filter(Boolean)
                    .map((src, index) => `![图片${dataUrls.length > 1 ? ` ${index + 1}` : ''}](${src})`)
                    .join('\n\n');

                if (!markdownImages) return;
                insertAtSelection(textarea, markdownImages, setMarkdownInput);
            })
            .catch((err) => {
                console.error('Clipboard image conversion failed:', err);
                alert('粘贴图片失败，请重试');
            });
        return;
    }

    if (textData && /^\[Image\s*#?\d*\]$/i.test(textData.trim())) {
        e.preventDefault();
        return;
    }

    const isFromIDE = isIDEFormattedHTML(htmlData, textData);
    if (isFromIDE && textData && isMarkdown(textData)) {
        return;
    }

    if (htmlData && htmlData.trim() !== '') {
        const hasPreTag = /<pre[\s>]/.test(htmlData);
        const hasCodeTag = /<code[\s>]/.test(htmlData);
        const isMainlyCode = (hasPreTag || hasCodeTag) && !htmlData.includes('<p') && !htmlData.includes('<div');

        if (isMainlyCode) {
            return;
        }

        if (htmlData.includes('file:///') || htmlData.includes('src="file:')) {
            e.preventDefault();
            return;
        }

        e.preventDefault();
        try {
            const markdown = htmlToMarkdown(htmlData, flowUsBlocksData);

            const textarea = e.currentTarget;
            insertAtSelection(textarea, markdown, setMarkdownInput);
        } catch (err) {
            console.error('HTML to Markdown conversion failed:', err);
            // Fallback to text
            const textarea = e.currentTarget;
            insertAtSelection(textarea, textData, setMarkdownInput);
        }
    } else if (textData && isMarkdown(textData)) {
        return;
    }
}
