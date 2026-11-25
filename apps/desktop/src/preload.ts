import { contextBridge, ipcRenderer } from 'electron';

// The renderer only gets this narrow, typed API; no Node access.
contextBridge.exposeInMainWorld('notesApi', {
  list: () => ipcRenderer.invoke('notes:list'),
  save: (input: { id?: string; title: string; body: string }) => ipcRenderer.invoke('notes:save', input),
  remove: (id: string) => ipcRenderer.invoke('notes:delete', id),
  importFile: () => ipcRenderer.invoke('notes:import'),
  exportFile: () => ipcRenderer.invoke('notes:export'),
});
