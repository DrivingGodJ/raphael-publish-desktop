import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { htmlToMarkdown, insertAtSelection } from './htmlToMarkdown';

function createFlowUsClipboardData(blocks: Array<{ id: string; type: number; title: string }>) {
    return JSON.stringify({
        blocks: blocks.map(block => ({
            id: block.id,
            subTree: {
                [block.id]: {
                    type: block.type,
                    title: block.title,
                },
            },
        })),
    });
}

describe('FlowUs callout conversion', () => {
    it('restores a copied FlowUs emphasis block as a Markdown blockquote', () => {
        const flowUsData = createFlowUsClipboardData([
            { id: 'callout', type: 13, title: '这是一段着重内容' },
        ]);

        expect(htmlToMarkdown('<p>这是一段着重内容</p>', flowUsData)).toBe('> 这是一段着重内容');
    });

    it('does not add a second quote marker when FlowUs HTML is already a blockquote', () => {
        const flowUsData = createFlowUsClipboardData([
            { id: 'callout', type: 13, title: '这是一段着重内容' },
        ]);

        expect(htmlToMarkdown('<blockquote><p>这是一段着重内容</p></blockquote>', flowUsData))
            .toBe('> 这是一段着重内容');
    });

    it('does not wrap a matched paragraph that is already inside a FlowUs blockquote', () => {
        const flowUsData = createFlowUsClipboardData([
            { id: 'normal', type: 0, title: '普通正文' },
            { id: 'callout', type: 13, title: '着重正文' },
        ]);

        const html = '<div><p>普通正文</p><blockquote><div><p>着重正文</p></div></blockquote><span>额外包装</span></div>';
        const markdown = htmlToMarkdown(html, flowUsData);

        expect(markdown).toContain('> 着重正文');
        expect(markdown).not.toMatch(/^\s*>\s*>/m);
    });

    it('collapses arbitrarily nested FlowUs blockquotes to one quote level', () => {
        const flowUsData = createFlowUsClipboardData([
            { id: 'callout', type: 13, title: '着重正文' },
        ]);

        expect(htmlToMarkdown('<blockquote><div><blockquote><p>着重正文</p></blockquote></div></blockquote>', flowUsData))
            .toBe('> 着重正文');
    });

    it('normalizes duplicate Markdown quote prefixes emitted by FlowUs HTML', () => {
        const flowUsData = createFlowUsClipboardData([
            { id: 'callout', type: 13, title: '着重正文' },
        ]);

        expect(htmlToMarkdown('<blockquote><blockquote><p>着重正文</p></blockquote></blockquote>', flowUsData))
            .toBe('> 着重正文');
    });

    it('only converts type 13 when normal and emphasis blocks are copied together', () => {
        const flowUsData = createFlowUsClipboardData([
            { id: 'normal', type: 0, title: '普通正文' },
            { id: 'callout', type: 13, title: '着重正文' },
        ]);

        expect(htmlToMarkdown('<p>普通正文</p><p><strong>着重正文</strong></p>', flowUsData))
            .toBe('普通正文\n\n> **着重正文**');
    });

    it('keeps ordinary HTML unchanged when FlowUs metadata is absent or invalid', () => {
        expect(htmlToMarkdown('<p>普通正文</p>')).toBe('普通正文');
        expect(htmlToMarkdown('<p>普通正文</p>', '{invalid')).toBe('普通正文');
    });
});

describe('insertAtSelection', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    function createTextarea(value: string) {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        document.body.appendChild(textarea);
        return textarea;
    }

    it('inserts text using the live textarea value so concurrent typing is preserved', () => {
        const textarea = createTextarea('START\nTYPED_AFTER_UPLOAD');
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

        let nextValue = '';
        insertAtSelection(textarea, '\n![图片](data:image/png;base64,AAA)', (value) => {
            nextValue = value;
            textarea.value = value;
        });

        expect(nextValue).toBe('START\nTYPED_AFTER_UPLOAD\n![图片](data:image/png;base64,AAA)');
    });

    it('replaces the active selection and moves the caret after the inserted text', () => {
        const textarea = createTextarea('hello world');
        textarea.selectionStart = 6;
        textarea.selectionEnd = 11;

        let nextValue = '';
        insertAtSelection(textarea, 'Raphael', (value) => {
            nextValue = value;
            textarea.value = value;
        });

        expect(nextValue).toBe('hello Raphael');

        vi.runAllTimers();

        expect(textarea.selectionStart).toBe('hello Raphael'.length);
        expect(textarea.selectionEnd).toBe('hello Raphael'.length);
    });
});
