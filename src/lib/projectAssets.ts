const PROJECT_IMAGE_DIRECTORY = '图片';

function encodeRelativePath(relativePath: string): string {
    return relativePath.split('/').map(encodeURIComponent).join('/');
}

export function resolveProjectAssets(markdown: string, projectId?: string): string {
    if (!projectId) return markdown;

    const toAssetUrl = (source: string) => {
        const normalized = source.replace(/\\/g, '/').replace(/^\.\//, '');
        if (!normalized.startsWith(`${PROJECT_IMAGE_DIRECTORY}/`)) return source;
        return `raphael-asset://project/${encodeURIComponent(projectId)}/${encodeRelativePath(normalized)}`;
    };

    return markdown
        .replace(/(!\[[^\]]*\]\(\s*)(?:<([^>]+)>|([^\s)]+))(?=(?:\s+["'][^"']*["'])?\s*\))/g, (_match, prefix, angleSource, plainSource) => {
            const source = angleSource || plainSource || '';
            const resolved = toAssetUrl(source);
            return `${prefix}${angleSource ? `<${resolved}>` : resolved}`;
        })
        .replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (_match, prefix, source, suffix) => {
            return `${prefix}${toAssetUrl(source)}${suffix}`;
        });
}

export function restoreProjectAssetPath(source: string, projectId?: string): string {
    if (!projectId) return source;
    const prefix = `raphael-asset://project/${encodeURIComponent(projectId)}/`;
    if (!source.startsWith(prefix)) return source;
    return decodeURIComponent(source.slice(prefix.length));
}
