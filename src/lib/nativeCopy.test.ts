import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyPlainTextWithNativeSelection, copyRichHtmlWithNativeSelection } from './nativeCopy';

interface CapturedClipboard {
    clearCount: number;
    values: Record<string, string>;
}

function installCopyEventMock(): CapturedClipboard {
    const captured: CapturedClipboard = { clearCount: 0, values: {} };
    Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: vi.fn(() => {
            const clipboardData = {
                clearData: () => {
                    captured.clearCount += 1;
                    captured.values = {};
                },
                setData: (type: string, value: string) => {
                    captured.values[type] = value;
                },
            };
            const event = new Event('copy', { bubbles: true, cancelable: true });
            Object.defineProperty(event, 'clipboardData', { value: clipboardData });
            document.dispatchEvent(event);
            return true;
        }),
    });
    return captured;
}

describe('native clipboard copying', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        Reflect.deleteProperty(document, 'execCommand');
    });

    it('writes clean HTML and a text fallback through the native copy event', () => {
        const captured = installCopyEventMock();
        const html = '<section><strong style="color:red">标题</strong></section>';

        expect(copyRichHtmlWithNativeSelection(html, '标题')).toBe(true);
        expect(captured.clearCount).toBe(1);
        expect(captured.values).toEqual({ 'text/html': html, 'text/plain': '标题' });
        expect(captured.values['text/html']).not.toContain('position:fixed');
        expect(captured.values['text/html']).not.toContain('contenteditable');
    });

    it('writes only text for the plain-text fallback', () => {
        const captured = installCopyEventMock();

        expect(copyPlainTextWithNativeSelection('只有纯文字')).toBe(true);
        expect(captured.values).toEqual({ 'text/plain': '只有纯文字' });
        expect(captured.values['text/html']).toBeUndefined();
    });
});
