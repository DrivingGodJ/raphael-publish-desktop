import { useEffect, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, Send, ShieldCheck, X } from 'lucide-react';
import type { WechatDraftResult } from '../types/desktop';

export interface WechatPublishFormValue {
    title: string;
    author: string;
    digest: string;
    coverPath: string;
    appId: string;
    appSecret: string;
}

interface WechatPublishDialogProps {
    open: boolean;
    defaultTitle: string;
    onClose: () => void;
    onSubmit: (value: WechatPublishFormValue) => Promise<WechatDraftResult>;
}

export default function WechatPublishDialog({ open, defaultTitle, onClose, onSubmit }: WechatPublishDialogProps) {
    const [title, setTitle] = useState(defaultTitle);
    const [author, setAuthor] = useState('');
    const [digest, setDigest] = useState('');
    const [coverPath, setCoverPath] = useState('');
    const [appId, setAppId] = useState('');
    const [appSecret, setAppSecret] = useState('');
    const [hasStoredSecret, setHasStoredSecret] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<WechatDraftResult | null>(null);

    useEffect(() => {
        if (!open) return;
        setTitle(defaultTitle);
        setError('');
        setResult(null);
        window.raphaelDesktop?.getPublisherSettings()
            .then(settings => {
                setAppId(settings.appId);
                setHasStoredSecret(settings.hasAppSecret);
            })
            .catch(() => undefined);
    }, [open, defaultTitle]);

    if (!open) return null;

    const chooseCover = async () => {
        const selected = await window.raphaelDesktop?.selectPublisherCover();
        if (selected) setCoverPath(selected);
    };

    const submit = async () => {
        setSubmitting(true);
        setError('');
        setResult(null);
        try {
            setResult(await onSubmit({ title, author, digest, coverPath, appId, appSecret }));
            setHasStoredSecret(true);
            setAppSecret('');
        }
        catch (submitError) {
            const rawMessage = submitError instanceof Error ? submitError.message : String(submitError);
            setError(rawMessage
                .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
                .replace(/^Error:\s*/i, ''));
        }
        finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" role="dialog" aria-label="发送到公众号草稿箱">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-black/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1c1c1e]">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="flex items-center gap-2 text-xl font-bold text-black dark:text-white"><Send size={20} />发送到公众号草稿箱</h2>
                        <p className="mt-1 text-sm text-[#86868b]">正文和图片直接上传，不经过公众号网页的粘贴流程。</p>
                    </div>
                    <button onClick={onClose} disabled={submitting} className="rounded-full p-2 text-[#86868b] hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10" aria-label="关闭"><X size={18} /></button>
                </div>

                {result ? (
                    <div className="mt-6 rounded-2xl bg-green-50 p-5 text-green-800 dark:bg-green-950/30 dark:text-green-300">
                        <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={20} />草稿创建成功</div>
                        <p className="mt-2 text-sm">已上传 {result.uploadedImageCount} 张正文图片。请前往公众号后台的草稿箱预览并发布。</p>
                        <p className="mt-1 break-all text-xs opacity-70">草稿编号：{result.mediaId}</p>
                    </div>
                ) : (
                    <>
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-sm font-medium">文章标题</span>
                                <input aria-label="文章标题" value={title} onChange={event => setTitle(event.target.value)} className="w-full rounded-xl border border-black/10 bg-[#f5f5f7] px-4 py-3 outline-none focus:border-[#0066cc] dark:border-white/10 dark:bg-[#2c2c2e]" />
                            </label>
                            <label>
                                <span className="mb-1.5 block text-sm font-medium">作者（可选）</span>
                                <input aria-label="作者" value={author} onChange={event => setAuthor(event.target.value)} className="w-full rounded-xl border border-black/10 bg-[#f5f5f7] px-4 py-3 outline-none focus:border-[#0066cc] dark:border-white/10 dark:bg-[#2c2c2e]" />
                            </label>
                            <div>
                                <span className="mb-1.5 block text-sm font-medium">封面图</span>
                                <button type="button" onClick={chooseCover} className="apple-btn-secondary flex w-full items-center justify-center gap-2 !rounded-xl !py-3"><ImagePlus size={16} />{coverPath ? '重新选择' : '选择封面'}</button>
                            </div>
                            {coverPath && <p className="-mt-2 truncate text-xs text-[#86868b] sm:col-span-2" title={coverPath}>{coverPath}</p>}
                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-sm font-medium">摘要（可选，最多 120 字）</span>
                                <textarea aria-label="摘要" value={digest} maxLength={120} onChange={event => setDigest(event.target.value)} className="h-20 w-full resize-none rounded-xl border border-black/10 bg-[#f5f5f7] px-4 py-3 outline-none focus:border-[#0066cc] dark:border-white/10 dark:bg-[#2c2c2e]" />
                            </label>
                        </div>

                        <div className="mt-5 rounded-2xl border border-black/10 p-4 dark:border-white/10">
                            <div className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} />公众号开发凭据</div>
                            <p className="mt-1 text-xs leading-5 text-[#86868b]">凭据由 Windows 本机加密保存，只用于直接请求微信官方接口，不发送给第三方服务。</p>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <input aria-label="公众号 AppID" placeholder="AppID" value={appId} onChange={event => setAppId(event.target.value)} className="rounded-xl border border-black/10 bg-[#f5f5f7] px-4 py-3 outline-none focus:border-[#0066cc] dark:border-white/10 dark:bg-[#2c2c2e]" />
                                <input aria-label="公众号 AppSecret" type="password" placeholder={hasStoredSecret ? '已安全保存，留空即可' : 'AppSecret'} value={appSecret} onChange={event => setAppSecret(event.target.value)} className="rounded-xl border border-black/10 bg-[#f5f5f7] px-4 py-3 outline-none focus:border-[#0066cc] dark:border-white/10 dark:bg-[#2c2c2e]" />
                            </div>
                        </div>

                        {error && <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
                    </>
                )}

                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} disabled={submitting} className="apple-btn-secondary">{result ? '关闭' : '取消'}</button>
                    {!result && (
                        <button data-testid="publish-draft-confirm" onClick={submit} disabled={submitting || !title.trim() || !appId.trim() || (!hasStoredSecret && !appSecret.trim())} className="apple-btn-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-45">
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            {submitting ? '正在上传并创建草稿…' : '创建草稿'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
