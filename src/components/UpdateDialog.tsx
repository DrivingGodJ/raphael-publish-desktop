import { useEffect, useRef, useState } from 'react';
import { ArrowUpCircle, CheckCircle2, Download, ExternalLink, Loader2, X } from 'lucide-react';
import type { RaphaelUpdateCheckResult, RaphaelUpdateProgress } from '../types/desktop';

interface UpdateDialogProps {
    open: boolean;
    update: RaphaelUpdateCheckResult | null;
    autoStartDownload: boolean;
    onClose: () => void;
    onBeforeInstall?: () => Promise<void>;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanErrorMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw
        .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
        .replace(/^Error:\s*/i, '');
}

export default function UpdateDialog({ open, update, autoStartDownload, onClose, onBeforeInstall }: UpdateDialogProps) {
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState<RaphaelUpdateProgress | null>(null);
    const [error, setError] = useState('');
    const [completedMode, setCompletedMode] = useState<'auto-relaunch' | 'opened-installer' | null>(null);
    const autoStartedRef = useRef(false);

    useEffect(() => {
        if (!open) {
            autoStartedRef.current = false;
            setDownloading(false);
            setProgress(null);
            setError('');
            setCompletedMode(null);
            return;
        }
        const unsubscribe = window.raphaelDesktop?.onUpdateProgress?.(next => setProgress(next));
        return () => {
            unsubscribe?.();
        };
    }, [open]);

    const startDownloadAndInstall = async () => {
        const desktop = window.raphaelDesktop;
        if (!desktop?.downloadAndInstallUpdate || !update?.canAutoInstall || downloading) return;
        setDownloading(true);
        setError('');
        setCompletedMode(null);
        setProgress({ stage: 'downloading', downloadedBytes: 0, totalBytes: update.asset?.size ?? null, percentage: 0 });
        try {
            if (onBeforeInstall) await onBeforeInstall();
            const result = await desktop.downloadAndInstallUpdate();
            if (result.mode === 'cancelled') {
                setProgress(null);
            } else {
                setCompletedMode(result.mode);
            }
        } catch (downloadError) {
            setError(cleanErrorMessage(downloadError));
            setProgress(null);
        } finally {
            setDownloading(false);
        }
    };

    useEffect(() => {
        if (!open || !autoStartDownload || !update?.canAutoInstall || autoStartedRef.current) return;
        autoStartedRef.current = true;
        void startDownloadAndInstall();
    }, [open, autoStartDownload, update]);

    if (!open || !update) return null;

    const handleCancelOrClose = async () => {
        if (downloading) {
            await window.raphaelDesktop?.cancelUpdateDownload?.();
        }
        onClose();
    };

    const handleOpenReleasePage = () => {
        void window.raphaelDesktop?.openReleasePage?.(update.releaseUrl);
    };

    const statusLabel = (() => {
        if (completedMode === 'auto-relaunch') return '安装包已就绪，正在退出并自动更新…';
        if (completedMode === 'opened-installer') return '安装包已下载并打开，请按窗口提示完成安装。';
        if (!progress) return '';
        if (progress.stage === 'verifying') return '下载完成，正在校验安装包完整性 (SHA-256)…';
        if (progress.stage === 'ready') return '校验通过，正在启动更新程序…';
        if (progress.percentage !== null && progress.totalBytes) {
            return `正在下载安装包… ${formatBytes(progress.downloadedBytes)} / ${formatBytes(progress.totalBytes)}（${progress.percentage}%）`;
        }
        return `正在下载安装包… ${formatBytes(progress.downloadedBytes)}`;
    })();

    const notesText = update.releaseNotes.trim() || '该版本未附带详细更新说明，可前往 GitHub 发布页查看完整变更。';

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" role="dialog" aria-label="发现新版本">
            <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[24px] border border-black/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1c1c1e]">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="flex items-center gap-2 text-xl font-bold text-black dark:text-white">
                            <ArrowUpCircle size={20} className="text-[#0066cc] dark:text-[#0a84ff]" />
                            发现新版本 v{update.latestVersion}
                        </h2>
                        <p className="mt-1 text-sm text-[#86868b]">
                            当前版本 v{update.currentVersion} → 最新版本 v{update.latestVersion}
                            {update.asset?.size ? ` · 安装包约 ${formatBytes(update.asset.size)}` : ''}
                        </p>
                    </div>
                    <button
                        onClick={handleCancelOrClose}
                        className="rounded-full p-2 text-[#86868b] hover:bg-black/5 dark:hover:bg-white/10"
                        aria-label="关闭"
                    >
                        <X size={18} />
                    </button>
                </div>

                {update.releaseName && !update.releaseName.includes(update.latestVersion) && (
                    <div className="mt-3 text-sm font-medium text-black/80 dark:text-white/80">{update.releaseName}</div>
                )}

                <div className="mt-4 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-black/10 bg-[#f5f5f7] p-4 text-sm leading-6 text-black/85 dark:border-white/10 dark:bg-[#2c2c2e] dark:text-white/85">
                    {notesText}
                </div>

                {(downloading || progress) && !completedMode && (
                    <div className="mt-4 rounded-2xl border border-black/10 bg-[#f5f5f7] p-4 dark:border-white/10 dark:bg-[#2c2c2e]">
                        <div className="flex items-center gap-2 text-sm text-black dark:text-white">
                            <Loader2 size={15} className="animate-spin text-[#0066cc] dark:text-[#0a84ff]" />
                            <span>{statusLabel}</span>
                        </div>
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                            <div
                                className="h-full rounded-full bg-[#0066cc] transition-all duration-150 dark:bg-[#0a84ff]"
                                style={{ width: `${progress?.percentage ?? 100}%` }}
                            />
                        </div>
                    </div>
                )}

                {completedMode && (
                    <div className="mt-4 rounded-2xl bg-green-50 p-4 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">
                        <div className="flex items-center gap-2 font-semibold">
                            <CheckCircle2 size={18} />
                            {statusLabel}
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 dark:bg-red-950/30 dark:text-red-300">
                        {error}
                    </div>
                )}

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={handleOpenReleasePage}
                        disabled={downloading}
                        className="apple-btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-45"
                    >
                        <ExternalLink size={15} />
                        查看发布页
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleCancelOrClose}
                            className="apple-btn-secondary text-sm"
                        >
                            {downloading ? '取消下载' : completedMode ? '关闭' : '暂不更新'}
                        </button>
                        {!completedMode && (
                            update.canAutoInstall ? (
                                <button
                                    type="button"
                                    data-testid="confirm-update-button"
                                    onClick={startDownloadAndInstall}
                                    disabled={downloading}
                                    className="apple-btn-primary flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                    {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                    {downloading ? '正在更新…' : error ? '重试下载' : '下载并更新'}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleOpenReleasePage}
                                    className="apple-btn-primary flex items-center gap-2 text-sm"
                                >
                                    <ExternalLink size={16} />
                                    前往发布页下载
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
