import { describe, expect, it } from 'vitest';
import { makeWeChatCompatible } from './wechatCompat';

function parseOutput(html: string) {
    return new DOMParser().parseFromString(html, 'text/html');
}

describe('WeChat text alignment compatibility', () => {
    it('adds an explicit standard left alignment to ordinary text blocks', async () => {
        const doc = parseOutput(await makeWeChatCompatible('<div><p>普通正文</p></div>', 'apple'));

        expect(doc.querySelector('section')?.style.textAlign).toBe('left');
        expect(doc.querySelector('p')?.style.textAlign).toBe('left');
    });

    it('preserves standard theme alignment values', async () => {
        const doc = parseOutput(await makeWeChatCompatible('<div><p style="text-align:center">居中正文</p></div>', 'apple'));

        expect(doc.querySelector('p')?.style.textAlign).toBe('center');
    });

    it('normalizes logical and browser-specific alignment values', async () => {
        const doc = parseOutput(await makeWeChatCompatible('<div><p style="text-align:start">左对齐</p><h2 style="text-align:-webkit-center">居中标题</h2></div>', 'apple'));

        expect(doc.querySelector('p')?.style.textAlign).toBe('left');
        expect(doc.querySelector('h2')?.style.textAlign).toBe('center');
    });
});

describe('WeChat safe HTML conversion', () => {
    it('keeps native list structure and rich styling for clipboard copying', async () => {
        const html = await makeWeChatCompatible('<div><ul class="article-list"><li style="color:#c00"><p><strong>项目</strong>说明</p></li></ul></div>', 'apple');
        const doc = parseOutput(html);

        expect(doc.querySelector('ul.article-list > li')).not.toBeNull();
        expect(doc.querySelector('li')?.getAttribute('style')).toContain('color:#c00');
        expect(doc.querySelector('li > p')).toBeNull();
        expect(doc.body.textContent).toContain('项目说明');
    });

    it('converts native lists to section-based inline markers', async () => {
        const html = await makeWeChatCompatible('<div><ul><li><strong>项目</strong>说明</li></ul></div>', 'apple', { imageMode: 'preserve', profile: 'publish' });
        const doc = parseOutput(html);

        expect(doc.querySelector('ul, ol, li')).toBeNull();
        expect(doc.body.textContent).toContain('•');
        expect(doc.body.textContent).toContain('项目说明');
    });

    it('removes unsupported attributes, tags, and CSS', async () => {
        const html = await makeWeChatCompatible('<div class="preview"><p onclick="bad()" style="float:left;position:fixed;z-index:9">正文</p><script>bad()</script></div>', 'apple', { imageMode: 'preserve', profile: 'publish' });

        expect(html).not.toMatch(/class=|onclick=|<script|float\s*:|position\s*:\s*fixed|z-index/i);
        expect(html).toContain('正文');
    });

    it('preserves local image sources for direct draft publishing', async () => {
        const source = 'raphael-asset://project/20260911000000-abcdef/%E5%9B%BE%E7%89%87/photo.jpg';
        const html = await makeWeChatCompatible(`<div><img src="${source}"></div>`, 'apple', { imageMode: 'preserve', profile: 'publish' });

        expect(html).toContain(source);
        expect(html).not.toContain('data:image/');
    });
});
