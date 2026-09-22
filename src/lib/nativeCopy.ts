interface ClipboardPayload {
    html?: string;
    text: string;
}

function copyThroughNativeEvent(payload: ClipboardPayload): boolean {
    let wroteClipboardData = false;
    const handleCopy = (event: ClipboardEvent) => {
        if (!event.clipboardData) return;
        event.clipboardData.clearData();
        if (payload.html) event.clipboardData.setData('text/html', payload.html);
        event.clipboardData.setData('text/plain', payload.text);
        event.preventDefault();
        wroteClipboardData = true;
    };

    document.addEventListener('copy', handleCopy, { once: true });
    try {
        const commandSucceeded = document.execCommand('copy');
        return commandSucceeded && wroteClipboardData;
    } finally {
        document.removeEventListener('copy', handleCopy);
    }
}

export function copyRichHtmlWithNativeSelection(html: string, text: string): boolean {
    return copyThroughNativeEvent({ html, text });
}

export function copyPlainTextWithNativeSelection(text: string): boolean {
    return copyThroughNativeEvent({ text });
}
