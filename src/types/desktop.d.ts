export interface RaphaelProjectSummary {
    id: string;
    title: string;
    folderName: string;
    articleFile: string;
    imageDirectory: string;
    createdAt: string;
    updatedAt: string;
    imageCount: number;
    failedImageCount: number;
    sourceImageCount?: number;
    themeId?: string;
}

export interface RaphaelProject extends RaphaelProjectSummary {
    markdown: string;
    imageMappings?: Array<{
        originalUrl: string;
        localFile: string;
        fileName: string;
        bytes: number;
    }>;
}

export interface RaphaelImageUpdateResult {
    project: RaphaelProject;
    scannedImageCount: number;
    downloadedImageCount: number;
    reusedImageCount: number;
    failedImageCount: number;
    removedImageCount: number;
}

export interface WechatDraftPayload {
    projectId: string;
    title: string;
    author: string;
    digest: string;
    content: string;
    coverPath?: string;
    appId: string;
    appSecret?: string;
}

export interface WechatDraftResult {
    mediaId: string;
    uploadedImageCount: number;
    usedSelectedCover: boolean;
}

export interface RaphaelDesktopApi {
    getInfo: () => Promise<{ appName: string; projectsRoot: string; version: string }>;
    listProjects: () => Promise<RaphaelProjectSummary[]>;
    createProject: (payload: { name: string; markdown?: string }) => Promise<RaphaelProject>;
    importProject: (payload: { name: string; markdown: string }) => Promise<RaphaelProject>;
    readProject: (id: string) => Promise<RaphaelProject>;
    saveProject: (payload: { id: string; markdown: string; themeId: string }) => Promise<RaphaelProjectSummary>;
    updateProjectImages: (payload: { id: string; markdown: string; themeId: string }) => Promise<RaphaelImageUpdateResult>;
    renameProject: (payload: { id: string; name: string }) => Promise<RaphaelProjectSummary>;
    deleteProject: (id: string) => Promise<{ deleted: boolean }>;
    openProjectFolder: (id: string) => Promise<{ opened: boolean }>;
    openProjectsRoot: () => Promise<{ opened: boolean }>;
    getPublisherSettings: () => Promise<{ appId: string; hasAppSecret: boolean }>;
    selectPublisherCover: () => Promise<string | null>;
    publishWechatDraft: (payload: WechatDraftPayload) => Promise<WechatDraftResult>;
}

declare global {
    interface Window {
        raphaelDesktop?: RaphaelDesktopApi;
    }
}
