import { FolderKanban, RefreshCw, Send } from 'lucide-react';
import { motion } from 'framer-motion';

interface HeaderProps {
    onOpenProjects: () => void;
    onUpdateImages: () => void;
    onPublishDraft: () => void;
    desktopAvailable: boolean;
    canUpdateImages: boolean;
    isUpdatingImages: boolean;
    projectTitle?: string;
    saveStateLabel: string;
    saveState: 'idle' | 'saving' | 'saved' | 'error';
}

export default function Header({ onOpenProjects, onUpdateImages, onPublishDraft, desktopAvailable, canUpdateImages, isUpdatingImages, projectTitle, saveStateLabel, saveState }: HeaderProps) {
    return (
        <header className="glass flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-[100]">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[8px] flex items-center justify-center bg-black dark:bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_12px_rgba(255,255,255,0.15)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.5 7.5L5 19H10.5C13.5376 19 16 16.5376 16 13.5C16 10.4624 13.5376 8 10.5 8H8.5V11.5L16.5 7.5Z" fill="var(--color-fg)" className="fill-white dark:fill-black" />
                        <path d="M8.5 4H10.5C15.7467 4 20 8.25329 20 13.5C20 18.7467 15.7467 23 10.5 23H4V4H8.5Z" fill="none" strokeWidth="2.5" stroke="currentColor" className="text-white dark:text-black" />
                        <path d="M4 11.5H8.5" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor" className="text-white dark:text-black" />
                    </svg>
                </div>
                <div className="min-w-0">
                    <div className="truncate font-bold text-lg tracking-tight text-black dark:text-white">Raphael Publish<span className="hidden xl:inline"> - 公众号排版大师</span></div>
                    <div className="flex items-center gap-2 text-[11px] text-[#86868b]">
                        <span className="max-w-[260px] truncate">{projectTitle || '未打开项目'}</span>
                        <span className={saveState === 'error' ? 'text-red-500' : ''}>{saveStateLabel}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
                {desktopAvailable && (
                    <>
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={onOpenProjects}
                            data-testid="project-manager-button"
                            className="apple-btn-secondary flex items-center gap-2 !rounded-xl !px-3 !py-2 text-sm"
                        >
                            <FolderKanban size={17} />
                            <span className="hidden sm:inline">项目管理</span>
                        </motion.button>
                        <motion.button
                            whileHover={canUpdateImages && !isUpdatingImages ? { scale: 1.03 } : undefined}
                            whileTap={canUpdateImages && !isUpdatingImages ? { scale: 0.97 } : undefined}
                            onClick={onUpdateImages}
                            disabled={!canUpdateImages || isUpdatingImages}
                            data-testid="image-update-button"
                            title={canUpdateImages ? '扫描当前文章中新加入的图片链接并保存到项目文件夹' : '请先打开或建立一个项目'}
                            className="apple-btn-secondary flex items-center gap-2 !rounded-xl !px-3 !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                        >
                            <RefreshCw size={17} className={isUpdatingImages ? 'animate-spin' : ''} />
                            <span className="hidden sm:inline">{isUpdatingImages ? '更新中…' : '更新图片'}</span>
                        </motion.button>
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={onPublishDraft}
                            disabled={!canUpdateImages}
                            data-testid="publish-draft-button"
                            className="apple-btn-primary flex items-center gap-2 !rounded-xl !px-3 !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                        >
                            <Send size={17} />
                            <span className="hidden lg:inline">发布草稿</span>
                        </motion.button>
                    </>
                )}
            </div>
        </header>
    );
}
