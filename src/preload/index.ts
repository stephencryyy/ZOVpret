// ============================================================================
// ZOVpret — Preload Script
// ============================================================================
// Безопасно экспонирует API из main process в renderer через contextBridge.
// Renderer получает доступ через window.api
// ============================================================================

import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // ─── Управление движком ─────────────────────────────────────
  startEngine: (strategyId?: string) =>
    ipcRenderer.invoke('engine:start', strategyId),

  stopEngine: () =>
    ipcRenderer.invoke('engine:stop'),

  getEngineState: () =>
    ipcRenderer.invoke('engine:state'),

  // ─── Smart Start ────────────────────────────────────────────
  runSmartStart: () =>
    ipcRenderer.invoke('smart-start:run'),

  abortSmartStart: () =>
    ipcRenderer.invoke('smart-start:abort'),

  // ─── Стратегии ──────────────────────────────────────────────
  getStrategies: () =>
    ipcRenderer.invoke('strategies:list'),

  setStrategy: (id: string) =>
    ipcRenderer.invoke('strategies:set', id),

  // ─── Настройки ──────────────────────────────────────────────
  getConfig: () =>
    ipcRenderer.invoke('config:get'),

  setConfig: (partial: Record<string, any>) =>
    ipcRenderer.invoke('config:set', partial),

  // ─── Обновления ─────────────────────────────────────────────
  checkUpdate: () =>
    ipcRenderer.invoke('updater:check'),

  performUpdate: () =>
    ipcRenderer.invoke('updater:perform'),

  areBinariesInstalled: () =>
    ipcRenderer.invoke('updater:binaries-installed'),

  // ─── Управление окном ───────────────────────────────────────
  minimizeWindow: () =>
    ipcRenderer.send('window:minimize'),

  closeWindow: () =>
    ipcRenderer.send('window:close'),

  // ─── Подписка на события ────────────────────────────────────
  onStatusChange: (callback: (status: string) => void) => {
    const handler = (_event: any, status: string) => callback(status)
    ipcRenderer.on('engine:status-changed', handler)
    return () => ipcRenderer.removeListener('engine:status-changed', handler)
  },

  onLog: (callback: (entry: any) => void) => {
    const handler = (_event: any, entry: any) => callback(entry)
    ipcRenderer.on('engine:log', handler)
    return () => ipcRenderer.removeListener('engine:log', handler)
  },

  onSmartStartProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('smart-start:progress', handler)
    return () => ipcRenderer.removeListener('smart-start:progress', handler)
  },

  onUpdateProgress: (callback: (message: string) => void) => {
    const handler = (_event: any, message: string) => callback(message)
    ipcRenderer.on('updater:progress', handler)
    return () => ipcRenderer.removeListener('updater:progress', handler)
  },

  // ─── Telegram Proxy ──────────────────────────────────────────
  startTgProxy: () =>
    ipcRenderer.invoke('tg-proxy:start'),

  stopTgProxy: () =>
    ipcRenderer.invoke('tg-proxy:stop'),

  getTgProxyState: () =>
    ipcRenderer.invoke('tg-proxy:state'),

  openTgProxyLink: () =>
    ipcRenderer.invoke('tg-proxy:open-link'),

  onTgProxyStatusChange: (callback: (status: string) => void) => {
    const handler = (_event: any, status: string) => callback(status)
    ipcRenderer.on('tg-proxy:status-changed', handler)
    return () => ipcRenderer.removeListener('tg-proxy:status-changed', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
