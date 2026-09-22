import { useEffect, useState, useRef, useCallback } from 'react';
import { PenLine, Eye } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { md, preprocessMarkdown, applyTheme } from './lib/markdown';
import { markElementIndexes } from './lib/markdownIndexer';
import { makeWeChatCompatible, cleanInternalAttributes } from './lib/wechatCompat';
import { THEMES } from './lib/themes';
import { defaultContent } from './defaultContent';
import { findImagePosition, selectTextAreaRange } from './lib/imageSelector';
import { findElementPosition, type ElementLocation } from './lib/markdownLocator';
import { resolveProjectAssets, restoreProjectAssetPath } from './lib/projectAssets';
import { copyPlainTextWithNativeSelection, copyRichHtmlWithNativeSelection } from './lib/nativeCopy';
import type { RaphaelProject } from './types/desktop';
import Header from './components/Header';
import ProjectManager from './components/ProjectManager';
import ThemeSelector from './components/ThemeSelector';
import Toolbar from './components/Toolbar';
import EditorPanel from './components/EditorPanel';
import PreviewPanel from './components/PreviewPanel';
import WechatPublishDialog, { type WechatPublishFormValue } from './components/WechatPublishDialog';

export default function App() {
    const [markdownInput, setMarkdownInput] = useState<string>(defaultContent);
    const [renderedHtml, setRenderedHtml] = useState<string>('');
    const [activeTheme, setActiveTheme] = useState(THEMES[0].id);
    const [copied, setCopied] = useState(false);
    const [plainCopied, setPlainCopied] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'pc'>('pc');
    const [activePanel, setActivePanel] = useState<'editor' | 'preview'>('editor');
    const [scrollSyncEnabled, setScrollSyncEnabled] = useState(true);
    const [currentProject, setCurrentProject] = useState<RaphaelProject | null>(null);
    const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);
    const [isUpdatingImages, setIsUpdatingImages] = useState(false);
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [notice, setNotice] = useState('');
    const [isPublishOpen, setIsPublishOpen] = useState(false);
    const isLoadingProjectRef = useRef(false);
    const saveTimerRef = useRef<number | null>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const editorScrollRef = useRef<HTMLTextAreaElement>(null);
    const previewOuterScrollRef = useRef<HTMLDivElement>(null);
    const previewInnerScrollRef = useRef<HTMLDivElement>(null);
    const scrollSyncLockRef = useRef<'editor' | 'preview' | null>(null);
    const scrollLockReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const applySystemTheme = (isDark: boolean) => {
            document.documentElement.classList.toggle('dark', isDark);
        };

        applySystemTheme(mediaQuery.matches);
        const handleChange = (event: MediaQueryListEvent) => applySystemTheme(event.matches);
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    const openProjectInEditor = useCallback((project: RaphaelProject) => {
        isLoadingProjectRef.current = true;
        setCurrentProject(project);
        setMarkdownInput(project.markdown);
        if (project.themeId && THEMES.some(theme => theme.id === project.themeId)) {
            setActiveTheme(project.themeId);
        }
        setSaveState('saved');
        window.setTimeout(() => {
            isLoadingProjectRef.current = false;
        }, 0);
    }, []);

    useEffect(() => {
        const desktop = window.raphaelDesktop;
        if (!desktop) return;
        desktop.listProjects()
            .then(async projects => {
                if (projects.length > 0) openProjectInEditor(await desktop.readProject(projects[0].id));
            })
            .catch(error => {
                console.error('Failed to load projects', error);
                setNotice('读取本地项目失败，请通过项目管理重试。');
            });
    }, [openProjectInEditor]);

    useEffect(() => {
        const desktop = window.raphaelDesktop;
        if (!desktop || !currentProject || isLoadingProjectRef.current) return;
        setSaveState('saving');
        saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null;
            desktop.saveProject({ id: currentProject.id, markdown: markdownInput, themeId: activeTheme })
                .then(() => setSaveState('saved'))
                .catch(error => {
                    console.error('Failed to save project', error);
                    setSaveState('error');
                });
        }, 650);
        return () => {
            if (saveTimerRef.current !== null) {
                window.clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
        };
    }, [markdownInput, activeTheme, currentProject?.id]);

    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(''), 5000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    useEffect(() => {
        // Core rendering: markdown → HTML → styled HTML
        const previewMarkdown = resolveProjectAssets(markdownInput, currentProject?.id);
        const rawHtml = md.render(preprocessMarkdown(previewMarkdown));
        const styledHtml = applyTheme(rawHtml, activeTheme);

        // Enhancement layer: add index markers for click-to-locate
        // This is decoupled from core rendering logic
        const indexedHtml = markElementIndexes(styledHtml);

        setRenderedHtml(indexedHtml);
    }, [markdownInput, activeTheme, currentProject?.id]);

    useEffect(() => {
        if (!scrollSyncEnabled) {
            scrollSyncLockRef.current = null;
            if (scrollLockReleaseTimeoutRef.current) {
                clearTimeout(scrollLockReleaseTimeoutRef.current);
                scrollLockReleaseTimeoutRef.current = null;
            }
        }
    }, [scrollSyncEnabled]);

    useEffect(() => {
        scrollSyncLockRef.current = null;
        if (scrollLockReleaseTimeoutRef.current) {
            clearTimeout(scrollLockReleaseTimeoutRef.current);
            scrollLockReleaseTimeoutRef.current = null;
        }
    }, [previewDevice]);

    useEffect(() => {
        return () => {
            if (scrollLockReleaseTimeoutRef.current) {
                clearTimeout(scrollLockReleaseTimeoutRef.current);
            }
        };
    }, []);

    const getActivePreviewScrollElement = () => {
        if (previewDevice === 'pc') return previewOuterScrollRef.current;
        return previewInnerScrollRef.current;
    };

    const syncScrollPosition = (
        sourceElement: HTMLElement,
        targetElement: HTMLElement,
        sourcePanel: 'editor' | 'preview'
    ) => {
        if (!scrollSyncEnabled) return;
        if (scrollSyncLockRef.current && scrollSyncLockRef.current !== sourcePanel) return;

        const sourceMaxScroll = sourceElement.scrollHeight - sourceElement.clientHeight;
        const targetMaxScroll = targetElement.scrollHeight - targetElement.clientHeight;
        if (sourceMaxScroll <= 0) {
            targetElement.scrollTop = 0;
            return;
        }

        const scrollRatio = sourceElement.scrollTop / sourceMaxScroll;
        scrollSyncLockRef.current = sourcePanel;
        targetElement.scrollTop = scrollRatio * Math.max(targetMaxScroll, 0);

        if (scrollLockReleaseTimeoutRef.current) {
            clearTimeout(scrollLockReleaseTimeoutRef.current);
        }

        scrollLockReleaseTimeoutRef.current = setTimeout(() => {
            if (scrollSyncLockRef.current === sourcePanel) {
                scrollSyncLockRef.current = null;
            }
            scrollLockReleaseTimeoutRef.current = null;
        }, 50);
    };

    const handleEditorScroll = () => {
        const editorElement = editorScrollRef.current;
        const previewElement = getActivePreviewScrollElement();
        if (!editorElement || !previewElement) return;
        syncScrollPosition(editorElement, previewElement, 'editor');
    };

    const handlePreviewOuterScroll = () => {
        if (previewDevice !== 'pc') return;
        const previewElement = previewOuterScrollRef.current;
        const editorElement = editorScrollRef.current;
        if (!previewElement || !editorElement) return;
        syncScrollPosition(previewElement, editorElement, 'preview');
    };

    const handlePreviewInnerScroll = () => {
        if (previewDevice === 'pc') return;
        const previewElement = previewInnerScrollRef.current;
        const editorElement = editorScrollRef.current;
        if (!previewElement || !editorElement) return;
        syncScrollPosition(previewElement, editorElement, 'preview');
    };

    const handleCopy = async () => {
        if (!previewRef.current) return;
        setIsCopying(true);
        try {
            const finalHtmlForCopy = await makeWeChatCompatible(renderedHtml, activeTheme);

            if (!copyRichHtmlWithNativeSelection(finalHtmlForCopy, previewRef.current.innerText)) {
                throw new Error('浏览器未能完成原生富文本复制。');
            }

            setPlainCopied(false);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Copy failed', err);
            alert('复制格式失败，请检查浏览器剪贴板权限');
        } finally {
            setIsCopying(false);
        }
    };

    const handleExportHtml = async () => {
        // Export a self-contained article so local project images stay available.
        const cleanHtml = cleanInternalAttributes(await makeWeChatCompatible(renderedHtml, activeTheme));
        const blob = new Blob([cleanHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Raphael_Article_${new Date().getTime()}.html`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportPdf = () => {
        if (!previewRef.current) return;
        const element = previewRef.current;
        const opt = {
            margin: 10,
            filename: `Raphael_Article_${new Date().getTime()}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: document.documentElement.classList.contains('dark') ? '#000000' : '#ffffff' },
            jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const }
        };
        const clonedElement = element.cloneNode(true) as HTMLElement;

        // Clean internal attributes from cloned element for PDF export
        const allElements = clonedElement.querySelectorAll('*');
        allElements.forEach(el => {
            el.removeAttribute('data-md-type');
            el.removeAttribute('data-md-index');
        });

        const cloneContainer = document.createElement('div');
        cloneContainer.style.background = document.documentElement.classList.contains('dark') ? '#000000' : '#ffffff';
        cloneContainer.appendChild(clonedElement);

        document.body.appendChild(cloneContainer);
        html2pdf().set(opt).from(cloneContainer).save().then(() => {
            document.body.removeChild(cloneContainer);
        });
    };

    const handleImageClick = useCallback((info: { type: string; index: number; src?: string; alt?: string; content?: string }) => {
        if (!editorScrollRef.current) return;

        let location: ElementLocation | null = null;

        // Images use specialized positioning
        if (info.type === 'image' && info.src) {
            const markdownSource = restoreProjectAssetPath(info.src, currentProject?.id);
            const match = findImagePosition(markdownInput, markdownSource, info.alt || '');
            if (match) {
                // Add type field to match ElementLocation interface
                location = {
                    start: match.start,
                    end: match.end,
                    type: 'image'
                };
            }
        } else {
            // Other elements use generic positioning
            location = findElementPosition(markdownInput, info.type, '', info.index);
        }

        if (location) {
            // Always select the entire content - consistent user experience
            selectTextAreaRange(editorScrollRef.current, location.start, location.end);

            // Switch to editor panel on mobile
            if (window.innerWidth < 768 && activePanel !== 'editor') {
                setActivePanel('editor');
            }
        }
    }, [markdownInput, activePanel, currentProject?.id]);

    const deviceWidthClass = () => {
        if (previewDevice === 'mobile') return 'w-[520px] max-w-full';
        if (previewDevice === 'tablet') return 'w-[800px] max-w-full';
        return 'w-[840px] xl:w-[1024px] max-w-[95%]';
    };

    const gridLayoutClass = () => {
        if (previewDevice === 'mobile') return 'md:grid-cols-[55fr_45fr]';
        if (previewDevice === 'tablet') return 'md:grid-cols-[45fr_55fr]';
        return 'md:grid-cols-[38.2fr_61.8fr]';
    };

    const handleCopyPlainText = () => {
        if (!previewRef.current) return;
        try {
            if (!copyPlainTextWithNativeSelection(previewRef.current.innerText)) {
                throw new Error('浏览器未能完成纯文本复制。');
            }
            setCopied(false);
            setPlainCopied(true);
            setTimeout(() => setPlainCopied(false), 2000);
        } catch (err) {
            console.error('Plain text copy failed', err);
            alert('复制纯文本失败，请重试');
        }
    };

    const handleUpdateImages = async () => {
        const desktop = window.raphaelDesktop;
        if (!desktop || !currentProject || isUpdatingImages) return;
        if (saveTimerRef.current !== null) {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }

        setIsUpdatingImages(true);
        setSaveState('saving');
        try {
            const result = await desktop.updateProjectImages({
                id: currentProject.id,
                markdown: markdownInput,
                themeId: activeTheme,
            });
            openProjectInEditor(result.project);
            const removedNote = result.removedImageCount ? `，清理 ${result.removedImageCount} 张未使用图片` : '';
            if (result.scannedImageCount === 0 && result.removedImageCount === 0) {
                setNotice('没有发现需要更新的网络图片链接，图片文件夹已经整理完成。');
            } else if (result.scannedImageCount === 0) {
                setNotice(`图片已整理：清理 ${result.removedImageCount} 张未使用图片。`);
            } else {
                const reusedNote = result.reusedImageCount ? `，复用 ${result.reusedImageCount} 张已有图片` : '';
                const failureNote = result.failedImageCount ? `，${result.failedImageCount} 张下载失败并保留原链接` : '';
                setNotice(`图片更新完成：新下载 ${result.downloadedImageCount} 张${reusedNote}${failureNote}${removedNote}。`);
            }
        } catch (error) {
            console.error('Failed to update project images', error);
            setSaveState('error');
            setNotice(error instanceof Error ? `图片更新失败：${error.message}` : '图片更新失败，请稍后重试。');
        } finally {
            setIsUpdatingImages(false);
        }
    };

    const buildPublishHtml = async () => {
        return cleanInternalAttributes(await makeWeChatCompatible(renderedHtml, activeTheme, { imageMode: 'preserve', profile: 'publish' }));
    };

    const handlePublishDraft = async (value: WechatPublishFormValue) => {
        const desktop = window.raphaelDesktop;
        if (!desktop || !currentProject) throw new Error('请先打开一个本地项目。');
        const html = await buildPublishHtml();
        return desktop.publishWechatDraft({
            projectId: currentProject.id,
            content: html,
            ...value,
        });
    };

    const handleProjectDeleted = (projectId: string) => {
        if (currentProject?.id !== projectId) return;
        setCurrentProject(null);
        setMarkdownInput(defaultContent);
        setSaveState('idle');
        setNotice('当前项目已移入回收站。');
    };

    const handleProjectRenamed = (project: { id: string; title: string }) => {
        setCurrentProject(current => current?.id === project.id ? { ...current, title: project.title } : current);
    };

    const saveStateLabel = currentProject
        ? saveState === 'saving' ? '正在保存…' : saveState === 'error' ? '保存失败' : '已保存到本地'
        : '当前内容尚未建立项目';

    return (
        <div className="flex flex-col h-screen overflow-hidden antialiased bg-[#fbfbfd] dark:bg-black transition-colors duration-300">

            <Header
                onOpenProjects={() => setIsProjectManagerOpen(true)}
                onUpdateImages={handleUpdateImages}
                onPublishDraft={() => setIsPublishOpen(true)}
                desktopAvailable={Boolean(window.raphaelDesktop)}
                canUpdateImages={Boolean(currentProject)}
                isUpdatingImages={isUpdatingImages}
                projectTitle={currentProject?.title}
                saveStateLabel={saveStateLabel}
                saveState={saveState}
            />

            {/* 移动端 Tab 切换 */}
            <div className="md:hidden glass-toolbar flex items-center z-[90]">
                <button
                    data-testid="tab-editor"
                    onClick={() => setActivePanel('editor')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-semibold transition-colors border-b-2 ${activePanel === 'editor' ? 'text-[#0066cc] dark:text-[#0a84ff] border-[#0066cc] dark:border-[#0a84ff]' : 'text-[#86868b] dark:text-[#a1a1a6] border-transparent'}`}
                >
                    <PenLine size={15} />
                    编辑
                </button>
                <button
                    data-testid="tab-preview"
                    onClick={() => setActivePanel('preview')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-semibold transition-colors border-b-2 ${activePanel === 'preview' ? 'text-[#0066cc] dark:text-[#0a84ff] border-[#0066cc] dark:border-[#0a84ff]' : 'text-[#86868b] dark:text-[#a1a1a6] border-transparent'}`}
                >
                    <Eye size={15} />
                    预览
                </button>
            </div>

            {/* 排版设置 & 工具栏 (桌面端) */}
            <div className={`glass-toolbar hidden md:grid grid-cols-1 ${gridLayoutClass()} px-0 z-[90] transition-all duration-500`}>
                <ThemeSelector activeTheme={activeTheme} onThemeChange={setActiveTheme} />
                <Toolbar
                    previewDevice={previewDevice}
                    onDeviceChange={setPreviewDevice}
                    onExportPdf={handleExportPdf}
                    onExportHtml={handleExportHtml}
                    onCopy={handleCopy}
                    onCopyPlain={handleCopyPlainText}
                    copied={copied}
                    plainCopied={plainCopied}
                    isCopying={isCopying}
                    scrollSyncEnabled={scrollSyncEnabled}
                    onToggleScrollSync={() => setScrollSyncEnabled((prev) => !prev)}
                />
            </div>

            {/* 移动端工具栏：分两行避免按钮被主题栏挤出可视区 */}
            <div className="md:hidden glass-toolbar z-[90]">
                <div className="overflow-x-auto no-scrollbar border-b border-[#00000010] dark:border-[#ffffff10]">
                    <ThemeSelector activeTheme={activeTheme} onThemeChange={setActiveTheme} />
                </div>
                <Toolbar
                    previewDevice={previewDevice}
                    onDeviceChange={setPreviewDevice}
                    onExportPdf={handleExportPdf}
                    onExportHtml={handleExportHtml}
                    onCopy={handleCopy}
                    onCopyPlain={handleCopyPlainText}
                    copied={copied}
                    plainCopied={plainCopied}
                    isCopying={isCopying}
                    scrollSyncEnabled={scrollSyncEnabled}
                    onToggleScrollSync={() => setScrollSyncEnabled((prev) => !prev)}
                />
            </div>

            {/* 编辑区 & 预览区 */}
            <main className={`flex-1 overflow-hidden grid grid-cols-1 ${gridLayoutClass()} relative transition-all duration-500`}>
                <div className={`${activePanel === 'editor' ? 'flex' : 'hidden'} md:flex flex-col overflow-hidden`}>
                    <EditorPanel
                        markdownInput={markdownInput}
                        onInputChange={setMarkdownInput}
                        editorScrollRef={editorScrollRef}
                        onEditorScroll={handleEditorScroll}
                        scrollSyncEnabled={scrollSyncEnabled}
                    />
                </div>
                <div className={`${activePanel === 'preview' ? 'flex' : 'hidden'} md:flex flex-col overflow-hidden`}>
                    <PreviewPanel
                        renderedHtml={renderedHtml}
                        deviceWidthClass={deviceWidthClass()}
                        previewDevice={previewDevice}
                        previewRef={previewRef}
                        previewOuterScrollRef={previewOuterScrollRef}
                        previewInnerScrollRef={previewInnerScrollRef}
                        onPreviewOuterScroll={handlePreviewOuterScroll}
                        onPreviewInnerScroll={handlePreviewInnerScroll}
                        scrollSyncEnabled={scrollSyncEnabled}
                        onImageClick={handleImageClick}
                    />
                </div>
            </main>

            <ProjectManager
                open={isProjectManagerOpen}
                currentProjectId={currentProject?.id}
                onClose={() => setIsProjectManagerOpen(false)}
                onOpenProject={openProjectInEditor}
                onProjectDeleted={handleProjectDeleted}
                onProjectRenamed={handleProjectRenamed}
            />
            <WechatPublishDialog
                open={isPublishOpen}
                defaultTitle={currentProject?.title || ''}
                onClose={() => setIsPublishOpen(false)}
                onSubmit={handlePublishDraft}
            />
            {notice && (
                <div className="fixed bottom-6 left-1/2 z-[400] max-w-[90vw] -translate-x-1/2 rounded-full bg-black px-5 py-3 text-sm text-white shadow-2xl dark:bg-white dark:text-black">
                    {notice}
                </div>
            )}

        </div>
    );
}
