const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shiba', {
  bark: (msg) => ipcRenderer.send('bark', msg),
  quit: () => ipcRenderer.send('quit'),
  onTriggerBark: (cb) => ipcRenderer.on('trigger-bark', cb),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.send('drag-end'),
});
