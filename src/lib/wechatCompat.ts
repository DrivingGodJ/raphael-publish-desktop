import { THEMES } from './themes';
import { stripIndexMarkers } from './markdownIndexer';

/**
 * Remove internal editor attributes from HTML
 * Used when exporting to avoid including internal implementation details
 *
 * This is now a thin wrapper around stripIndexMarkers from the indexing layer.
 * Keeping this function for backward compatibility.
 */
export function cleanInternalAttributes(html: string): string {
    return stripIndexMarkers(html);
}

export interface WeChatCompatibilityOptions {
    imageMode?: 'base64' | 'preserve';
    profile?: 'copy' | 'publish';
}

// Helper used only by the legacy clipboard fallback. Direct draft publishing keeps
// local image URLs intact so the Electron main process can upload them to WeChat.
async function getBase64Image(imgUrl: string): Promise<string> {
    try {
        if (imgUrl.startsWith('data:')) return imgUrl;

        const response = await fetch(imgUrl, { mode: 'cors', cache: 'default' });
        if (!response.ok) return imgUrl;

        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(imgUrl);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        return imgUrl;
    }
}

const WECHAT_TEXT_ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);
const FORBIDDEN_STYLE_PATTERNS = [
    /position\s*:\s*(?:fixed|sticky)\s*;?/gi,
    /float\s*:\s*[^;]+;?/gi,
    /clear\s*:\s*[^;]+;?/gi,
    /z-index\s*:\s*[^;]+;?/gi,
    /filter\s*:\s*[^;]+;?/gi,
    /columns?(?:-[a-z-]+)?\s*:\s*[^;]+;?/gi,
    /@font-face[^;]*;?/gi,
];

function sanitizeInlineStyle(style: string): string {
    let sanitized = normalizeTextAlignment(style);
    FORBIDDEN_STYLE_PATTERNS.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '');
    });
    return sanitized
        .replace(/(?:^|;)\s*margin-(?:top|right|bottom|left)\s*:\s*-(?:[3-9]\d|\d{3,})px\s*;?/gi, ';')
        .replace(/;{2,}/g, ';')
        .trim();
}

function replaceElementTag(doc: Document, element: Element, tagName: string): Element {
    const replacement = doc.createElement(tagName);
    Array.from(element.attributes).forEach(attribute => replacement.setAttribute(attribute.name, attribute.value));
    while (element.firstChild) replacement.appendChild(element.firstChild);
    element.parentNode?.replaceChild(replacement, element);
    return replacement;
}

function convertListsToSections(doc: Document, root: Element): void {
    const lists = Array.from(root.querySelectorAll('ul, ol')).reverse();
    lists.forEach(list => {
        const ordered = list.tagName === 'OL';
        const wrapper = doc.createElement('section');
        const listStyle = sanitizeInlineStyle(list.getAttribute('style') || '');
        wrapper.setAttribute('style', `${listStyle}${listStyle && !listStyle.endsWith(';') ? ';' : ''} margin: 12px 0;`);

        Array.from(list.children).forEach((child, index) => {
            if (child.tagName !== 'LI') return;
            const item = doc.createElement('section');
            item.setAttribute('style', 'display: flex; align-items: flex-start; margin: 6px 0; text-align: left;');

            const marker = doc.createElement('span');
            marker.textContent = ordered ? `${index + 1}.` : '•';
            marker.setAttribute('style', 'flex: 0 0 auto; min-width: 1.5em; text-align: left;');

            const content = doc.createElement('section');
            content.setAttribute('style', 'flex: 1 1 auto; min-width: 0; text-align: left;');
            while (child.firstChild) content.appendChild(child.firstChild);

            item.append(marker, content);
            wrapper.appendChild(item);
        });
        list.parentNode?.replaceChild(wrapper, list);
    });
}

function normalizeTextAlignment(style: string, addDefault = false): string {
    let found = false;
    const normalized = style.replace(/text-align\s*:\s*([^;!]+)\s*(!important)?\s*;?/gi, (_match, rawValue, important) => {
        found = true;
        const value = String(rawValue).trim().toLowerCase();
        const mapped = value === 'start' || value === '-webkit-left'
            ? 'left'
            : value === 'end' || value === '-webkit-right'
                ? 'right'
                : value === '-webkit-center'
                    ? 'center'
                    : value === 'justify-all'
                        ? 'justify'
                        : WECHAT_TEXT_ALIGNMENTS.has(value) ? value : 'left';
        return `text-align: ${mapped}${important ? ' !important' : ''};`;
    });

    if (!found && addDefault) return `${normalized}${normalized.trimEnd().endsWith(';') ? '' : ';'} text-align: left;`;
    return normalized;
}

export async function makeWeChatCompatible(
    html: string,
    themeId: string,
    options: WeChatCompatibilityOptions = {},
): Promise<string> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
    const containerStyle = theme.styles.container || '';
    const profile = options.profile || 'copy';

    // 0. Remove internal editor attributes (for click-to-locate feature)
    // These are only used in the editor and should not appear in the final HTML
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
        el.removeAttribute('data-md-type');
        el.removeAttribute('data-md-index');
    });

    // Note: We manually remove attributes here before DOM manipulation
    // The stripIndexMarkers() function is also available for HTML string operations

    // 1. WeChat prefers <section> as the root wrapper for overall styling
    // If the root is a div, let's wrap or convert it to a section.
    const rootNodes = Array.from(doc.body.children);

    // Create new wrap section
    const section = doc.createElement('section');
    section.setAttribute('style', normalizeTextAlignment(containerStyle, true));

    rootNodes.forEach(node => {
        // If the original html came from applyTheme it already has a root div
        // We strip it regardless of exact style string match to avoid double layers
        if (node.tagName === 'DIV' && rootNodes.length === 1) {
            Array.from(node.childNodes).forEach(child => section.appendChild(child));
        } else {
            section.appendChild(node);
        }
    });

    // 2. WeChat ignores flex in many scenarios. Convert image flex wrappers to table layout.
    const flexLikeNodes = section.querySelectorAll('div, p.image-grid');
    flexLikeNodes.forEach(node => {
        // Keep code block internals untouched.
        if (node.closest('pre, code')) return;

        const style = node.getAttribute('style') || '';
        const isFlexNode = style.includes('display: flex') || style.includes('display:flex');
        const isImageGrid = node.classList.contains('image-grid');
        if (!isFlexNode && !isImageGrid) return;

        const flexChildren = Array.from(node.children);
        if (flexChildren.every(child => child.tagName === 'IMG' || child.querySelector('img'))) {
            const table = doc.createElement('table');
            table.setAttribute('style', 'width: 100%; border-collapse: collapse; margin: 16px 0; border: none !important;');
            const tbody = doc.createElement('tbody');
            const tr = doc.createElement('tr');
            tr.setAttribute('style', 'border: none !important; background: transparent !important;');

            flexChildren.forEach(child => {
                const td = doc.createElement('td');
                td.setAttribute('style', 'padding: 0 4px; vertical-align: top; border: none !important; background: transparent !important;');
                td.appendChild(child);
                // Update child width to 100% since it's now bound by TD
                if (child.tagName === 'IMG') {
                    const currentStyle = child.getAttribute('style') || '';
                    child.setAttribute('style', currentStyle.replace(/width:\s*[^;]+;?/g, '') + ' width: 100% !important; display: block; margin: 0 auto;');
                }
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
            table.appendChild(tbody);
            node.parentNode?.replaceChild(table, node);
        } else if (isFlexNode) {
            // Non-image flex items just get stripped of flex.
            node.setAttribute('style', style.replace(/display:\s*flex;?/g, 'display: block;'));
        }
    });

    // Direct API publishing uses a deliberately conservative structure. Manual
    // clipboard copying keeps native lists because it preserves the original
    // theme and editor behavior more faithfully.
    if (profile === 'publish') {
        convertListsToSections(doc, section);
    } else {
        section.querySelectorAll('li > p').forEach(paragraph => replaceElementTag(doc, paragraph, 'span'));
    }

    // 4. Force Inheritance
    // WeChat's editor aggressively overrides inherited fonts on <p>, <li>, etc.
    // So we manually distribute the container's font properties to all individual blocks.
    const fontMatch = containerStyle.match(/font-family:\s*([^;]+);/);
    const sizeMatch = containerStyle.match(/font-size:\s*([^;]+);/);
    const colorMatch = containerStyle.match(/color:\s*([^;]+);/);
    const lineHeightMatch = containerStyle.match(/line-height:\s*([^;]+);/);

    // We only enforce on specific text tags that WeChat likes to hijack
    const textNodes = section.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, span');
    textNodes.forEach(node => {
        // Preserve code highlighting tokens inside code blocks.
        if (node.tagName === 'SPAN' && node.closest('pre, code')) return;

        let currentStyle = node.getAttribute('style') || '';
        if (currentStyle && !currentStyle.trimEnd().endsWith(';')) currentStyle += ';';

        if (fontMatch && !currentStyle.includes('font-family:')) {
            currentStyle += ` font-family: ${fontMatch[1]};`;
        }
        if (lineHeightMatch && !currentStyle.includes('line-height:')) {
            currentStyle += ` line-height: ${lineHeightMatch[1]};`;
        }
        // Add font-size if not present (only for standard text nodes so we don't shrink headings)
        if (sizeMatch && !currentStyle.includes('font-size:') && ['P', 'LI', 'BLOCKQUOTE', 'SPAN'].includes(node.tagName)) {
            currentStyle += ` font-size: ${sizeMatch[1]};`;
        }
        if (colorMatch && !currentStyle.includes('color:')) {
            currentStyle += ` color: ${colorMatch[1]};`;
        }

        node.setAttribute('style', currentStyle.trim());
    });

    // WeChat's structure checker rejects logical/browser-specific alignment values such as
    // `start` and `-webkit-center`. Give every text block an explicit physical alignment.
    const alignedBlocks = section.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, section');
    alignedBlocks.forEach(node => {
        node.setAttribute('style', normalizeTextAlignment(node.getAttribute('style') || '', true).trim());
    });

    // Keep CJK punctuation attached to preceding inline emphasis in WeChat.
    // Example: <strong>标题</strong>：说明 -> <strong>标题：</strong>说明
    const inlineNodes = section.querySelectorAll('strong, b, em, span, a, code');
    inlineNodes.forEach(node => {
        const next = node.nextSibling;
        if (!next || next.nodeType !== Node.TEXT_NODE) return;
        const text = next.textContent || '';
        const match = text.match(/^\s*([：；，。！？、:])(.*)$/s);
        if (!match) return;

        const punct = match[1];
        const rest = match[2] || '';
        node.appendChild(doc.createTextNode(punct));
        if (rest) {
            next.textContent = rest;
        } else {
            next.parentNode?.removeChild(next);
        }
    });

    // Direct API publishing gets the stricter sanitizer. Clipboard copying keeps
    // the theme's richer inline structure for the best visual fidelity.
    if (profile === 'publish') {
        section.querySelectorAll('script, style, link, form, input, button, select, textarea, iframe, audio, video, object, embed, svg, foreignObject').forEach(node => node.remove());
        Array.from(section.querySelectorAll('*')).forEach(node => {
            Array.from(node.attributes).forEach(attribute => {
                const name = attribute.name.toLowerCase();
                if (name === 'class' || name === 'id' || name.startsWith('data-md-') || name.startsWith('on')) {
                    node.removeAttribute(attribute.name);
                }
            });
            const style = node.getAttribute('style');
            if (style !== null) {
                const sanitized = sanitizeInlineStyle(style);
                if (sanitized) node.setAttribute('style', sanitized);
                else node.removeAttribute('style');
            }
            if (node.tagName === 'A' && /^javascript:/i.test(node.getAttribute('href') || '')) node.removeAttribute('href');
        });

        Array.from(section.querySelectorAll('div')).forEach(node => replaceElementTag(doc, node, 'section'));
    }

    // 6. Base64 is retained only for the manual-copy fallback. Direct publishing
    // uploads images first and substitutes WeChat-hosted URLs in the main process.
    const imgs = Array.from(section.querySelectorAll('img'));
    if ((options.imageMode || 'base64') === 'base64') {
        await Promise.all(imgs.map(async img => {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('data:')) {
                const base64 = await getBase64Image(src);
                img.setAttribute('src', base64);
            }
        }));
    }

    doc.body.innerHTML = '';
    doc.body.appendChild(section);

    // Prevent WeChat from breaking lines between inline emphasis and leading CJK punctuation.
    // Example: </strong>： should stay on the same line.
    let outputHtml = doc.body.innerHTML;
    outputHtml = outputHtml.replace(/(<\/(?:strong|b|em|span|a|code)>)\s*([：；，。！？、])/g, '$1\u2060$2');

    return outputHtml;
}
