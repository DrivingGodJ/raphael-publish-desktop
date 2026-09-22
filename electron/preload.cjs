const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('raphaelDesktop', {
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
  listProjects: () => ipcRenderer.invoke('project:list'),
  createProject: payload => ipcRenderer.invoke('project:create', payload),
  importProject: payload => ipcRenderer.invoke('project:import', payload),
  readProject: id => ipcRenderer.invoke('project:read', id),
  saveProject: payload => ipcRenderer.invoke('project:save', payload),
  updateProjectImages: payload => ipcRenderer.invoke('project:update-images', payload),
  renameProject: payload => ipcRenderer.invoke('project:rename', payload),
  deleteProject: id => ipcRenderer.invoke('project:delete', id),
  openProjectFolder: id => ipcRenderer.invoke('project:open-folder', id),
  openProjectsRoot: () => ipcRenderer.invoke('project:open-root'),
  getPublisherSettings: () => ipcRenderer.invoke('publisher:get-settings'),
  selectPublisherCover: () => ipcRenderer.invoke('publisher:select-cover'),
  publishWechatDraft: payload => ipcRenderer.invoke('publisher:publish-draft', payload),
})
