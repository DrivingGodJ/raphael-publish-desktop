import { useEffect, useState } from 'react';
import { ExternalLink, FilePlus2, FolderOpen, Image, Loader2, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
import type { RaphaelProject, RaphaelProjectSummary } from '../types/desktop';

interface ProjectManagerProps {
    open: boolean;
    currentProjectId?: string;
    onClose: () => void;
    onOpenProject: (project: RaphaelProject) => void;
    onProjectDeleted: (id: string) => void;
    onProjectRenamed: (project: RaphaelProjectSummary) => void;
}

function formatDate(value: string): string {
    try {
        return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch {
        return value;
    }
}

type TitleDialogState =
    | { mode: 'create' }
    | { mode: 'rename'; project: RaphaelProjectSummary };

export default function ProjectManager({ open, currentProjectId, onClose, onOpenProject, onProjectDeleted, onProjectRenamed }: ProjectManagerProps) {
    const desktop = window.raphaelDesktop;
    const [projects, setProjects] = useState<RaphaelProjectSummary[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [busyId, setBusyId] = useState('');
    const [error, setError] = useState('');
    const [titleDialog, setTitleDialog] = useState<TitleDialogState | null>(null);
    const [titleValue, setTitleValue] = useState('');
    const [isSubmittingTitle, setIsSubmittingTitle] = useState(false);

    const refresh = async () => {
        if (!desktop) return;
        setIsLoading(true);
        setError('');
        try {
            setProjects(await desktop.listProjects());
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (open) void refresh();
    }, [open]);

    if (!open) return null;

    const openCreateDialog = () => {
        setTitleValue('');
        setError('');
        setTitleDialog({ mode: 'create' });
    };

    const openRenameDialog = (project: RaphaelProjectSummary) => {
        setTitleValue(project.title);
        setError('');
        setTitleDialog({ mode: 'rename', project });
    };

    const submitTitle = async () => {
        const nextTitle = titleValue.trim();
        if (!desktop || !titleDialog || !nextTitle) return;
        setIsSubmittingTitle(true);
        setError('');
        try {
            if (titleDialog.mode === 'create') {
                const project = await desktop.createProject({ name: nextTitle });
                setTitleDialog(null);
                onOpenProject(project);
                onClose();
            } else {
                if (nextTitle === titleDialog.project.title) {
                    setTitleDialog(null);
                    return;
                }
                setBusyId(titleDialog.project.id);
                const renamedProject = await desktop.renameProject({ id: titleDialog.project.id, name: nextTitle });
                onProjectRenamed(renamedProject);
                setTitleDialog(null);
                await refresh();
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setIsSubmittingTitle(false);
            setBusyId('');
        }
    };

    const openProject = async (project: RaphaelProjectSummary) => {
        if (!desktop) return;
        setBusyId(project.id);
        try {
            onOpenProject(await desktop.readProject(project.id));
            onClose();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusyId('');
        }
    };

    const deleteProject = async (project: RaphaelProjectSummary) => {
        if (!desktop) return;
        const confirmed = window.confirm(`确定删除“${project.title}”吗？\n\n项目文件夹会被整体移入回收站。`);
        if (!confirmed) return;
        setBusyId(project.id);
        try {
            await desktop.deleteProject(project.id);
            onProjectDeleted(project.id);
            await refresh();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusyId('');
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/35 p-5 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <section role="dialog" aria-modal="true" aria-label="项目管理" className="flex h-[78vh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1c1c1e]">
                <header className="flex items-start justify-between border-b border-black/10 px-6 py-5 dark:border-white/10">
                    <div>
                        <h2 className="text-xl font-bold">项目管理</h2>
                        <p className="mt-1 text-sm text-[#86868b]">每个项目拥有独立的正文、图片和项目资料文件夹。</p>
                    </div>
                    <button className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10" onClick={onClose} aria-label="关闭"><X size={19} /></button>
                </header>

                <div className="flex flex-wrap items-center gap-3 border-b border-black/10 px-6 py-4 dark:border-white/10">
                    <button data-testid="new-project-button" className="apple-btn-primary flex items-center gap-2" onClick={openCreateDialog}><FilePlus2 size={17} />新建项目</button>
                    <button className="apple-btn-secondary flex items-center gap-2" onClick={() => void desktop?.openProjectsRoot()}><FolderOpen size={17} />项目总目录</button>
                    <button className="rounded-full p-2.5 hover:bg-black/5 dark:hover:bg-white/10" onClick={refresh} title="刷新"><RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} /></button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                    {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
                    {isLoading && projects.length === 0 ? (
                        <div className="flex h-48 items-center justify-center gap-2 text-[#86868b]"><Loader2 size={19} className="animate-spin" />正在读取项目…</div>
                    ) : projects.length === 0 ? (
                        <div className="flex h-48 flex-col items-center justify-center text-center text-[#86868b]"><FolderOpen size={38} className="mb-3 opacity-50" /><p>还没有项目</p><p className="mt-1 text-sm">点击“新建项目”，创建后在主页直接粘贴 FlowUs 正文。</p></div>
                    ) : (
                        <div className="space-y-3">
                            {projects.map(project => (
                                <article key={project.id} className={`rounded-2xl border p-4 transition ${project.id === currentProjectId ? 'border-[#0066cc] bg-blue-50/60 dark:bg-blue-950/20' : 'border-black/10 dark:border-white/10'}`}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="truncate font-semibold" title={project.title}>{project.title}</h3>
                                            <p className="mt-1 text-xs text-[#86868b]">更新于 {formatDate(project.updatedAt)}</p>
                                            <p className="mt-2 flex items-center gap-1.5 text-xs text-[#86868b]"><Image size={14} />{project.imageCount || 0} 张本地图片{project.failedImageCount ? <span className="text-amber-600"> · {project.failedImageCount} 张下载失败</span> : null}</p>
                                        </div>
                                        <div className="flex flex-wrap justify-end gap-2">
                                            <button className="apple-btn-secondary !px-3 !py-2" onClick={() => void desktop?.openProjectFolder(project.id)} title="打开文件夹"><FolderOpen size={16} /></button>
                                            <button data-testid={`rename-project-${project.id}`} className="apple-btn-secondary !px-3 !py-2" onClick={() => openRenameDialog(project)} title="重命名"><Pencil size={16} /></button>
                                            <button className="apple-btn-secondary !px-3 !py-2 text-red-600" onClick={() => void deleteProject(project)} title="删除"><Trash2 size={16} /></button>
                                            <button className="apple-btn-primary flex items-center gap-2 !px-4 !py-2" onClick={() => void openProject(project)} disabled={busyId === project.id}>
                                                {busyId === project.id ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}打开
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </section>
            {titleDialog && (
                <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/45 p-5" onMouseDown={(event) => event.target === event.currentTarget && !isSubmittingTitle && setTitleDialog(null)}>
                    <section role="dialog" aria-modal="true" aria-label={titleDialog.mode === 'create' ? '新建项目' : '重命名项目'} className="w-full max-w-md rounded-[22px] border border-black/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1c1c1e]">
                        <h3 className="text-lg font-bold">{titleDialog.mode === 'create' ? '新建项目' : '重命名项目'}</h3>
                        <label className="mt-5 block text-sm font-medium" htmlFor="project-title-input">项目标题</label>
                        <input
                            id="project-title-input"
                            autoFocus
                            value={titleValue}
                            onChange={(event) => setTitleValue(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && void submitTitle()}
                            className="mt-2 w-full rounded-xl border border-black/10 bg-[#f7f7f9] px-4 py-3 outline-none focus:border-[#0066cc] dark:border-white/10 dark:bg-[#2c2c2e]"
                            placeholder="输入项目标题"
                        />
                        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
                        <div className="mt-6 flex justify-end gap-3">
                            <button className="apple-btn-secondary" onClick={() => setTitleDialog(null)} disabled={isSubmittingTitle}>取消</button>
                            <button className="apple-btn-primary flex items-center gap-2 disabled:opacity-50" onClick={() => void submitTitle()} disabled={!titleValue.trim() || isSubmittingTitle}>
                                {isSubmittingTitle && <Loader2 size={16} className="animate-spin" />}
                                {titleDialog.mode === 'create' ? '创建' : '保存'}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
