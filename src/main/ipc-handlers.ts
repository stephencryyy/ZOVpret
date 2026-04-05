// ============================================================================
// ZOVpret — IPC обработчики (мост между Main и Renderer)
// ============================================================================

import { ipcMain, BrowserWindow, shell } from 'electron'
import { ZapretEngine } from './zapret-engine'
import { TgProxyEngine } from './tg-proxy-engine'
import { SmartStart } from './smart-start'
import { STRATEGIES, getStrategyById } from './strategy-pool'
import { getConfig, setConfig } from './config-store'
import { checkForUpdate, performUpdate, areBinariesInstalled } from './updater'

/**
 * Регистрирует все IPC-обработчики.
 * Вызывается один раз при инициализации приложения.
 */
export function registerIpcHandlers(
  engine: ZapretEngine,
  tgProxy: TgProxyEngine,
  resourcesPath: string,
  getMainWindow: () => BrowserWindow | null
): void {
  let smartStart: SmartStart | null = null

  // ─── Управление движком ─────────────────────────────────────
  ipcMain.handle('engine:start', async (_event, strategyId?: string) => {
    const config = getConfig()
    const id = strategyId || config.lastStrategyId || 'general'
    const strategy = getStrategyById(id) || STRATEGIES[0]
    await engine.start(strategy)
    return { success: true }
  })

  ipcMain.handle('engine:stop', async () => {
    await engine.stop()
    return { success: true }
  })

  ipcMain.handle('engine:state', () => {
    return {
      status: engine.status === 'running' ? 'connected' :
              engine.status === 'starting' ? 'connecting' :
              engine.status === 'error' ? 'error' : 'disconnected',
      currentStrategy: engine.currentStrategy,
      pid: engine.pid,
      uptime: engine.uptime,
      logs: engine.logs
    }
  })

  // ─── Smart Start ────────────────────────────────────────────
  ipcMain.handle('smart-start:run', async (_event, deepAnalysis: boolean = false) => {
    smartStart = new SmartStart(engine)

    // Пробрасываем прогресс в окно
    smartStart.on('progress', (data) => {
      const win = getMainWindow()
      if (win) win.webContents.send('smart-start:progress', data)
    })

    const result = await smartStart.run(deepAnalysis)
    smartStart = null
    return result
  })

  ipcMain.handle('smart-start:abort', () => {
    if (smartStart) {
      smartStart.abort()
      smartStart = null
    }
  })

  // ─── Стратегии ──────────────────────────────────────────────
  ipcMain.handle('strategies:list', () => {
    return STRATEGIES.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category
    }))
  })

  ipcMain.handle('strategies:set', async (_event, id: string) => {
    if (id === 'auto' || id === 'auto-deep') {
      setConfig({ lastStrategyId: id }) // 'auto' or 'auto-deep'
      return
    }
    
    const strategy = getStrategyById(id)
    if (!strategy) throw new Error(`Стратегия ${id} не найдена`)

    setConfig({ lastStrategyId: id })

    if (engine.status === 'running') {
      await engine.start(strategy) // Перезапуск с новой стратегией
    }
  })

  // ─── Настройки ──────────────────────────────────────────────
  ipcMain.handle('config:get', () => getConfig())

  ipcMain.handle('config:set', (_event, partial: Record<string, any>) => {
    setConfig(partial)
    return getConfig()
  })

  // ─── Обновления ─────────────────────────────────────────────
  ipcMain.handle('updater:check', async () => {
    return await checkForUpdate()
  })

  ipcMain.handle('updater:perform', async () => {
    await performUpdate(resourcesPath, (msg) => {
      const win = getMainWindow()
      if (win) win.webContents.send('updater:progress', msg)
    })
    return { success: true }
  })

  ipcMain.handle('updater:binaries-installed', () => {
    return areBinariesInstalled(resourcesPath)
  })

  // ─── Telegram Proxy ─────────────────────────────────────────
  ipcMain.handle('tg-proxy:start', async () => {
    await tgProxy.start()
    return tgProxy.info
  })

  ipcMain.handle('tg-proxy:stop', async () => {
    await tgProxy.stop()
    return tgProxy.info
  })

  ipcMain.handle('tg-proxy:state', () => {
    return {
      ...tgProxy.info,
      installed: tgProxy.isInstalled()
    }
  })

  ipcMain.handle('tg-proxy:open-link', () => {
    const link = tgProxy.info.tgLink
    shell.openExternal(link)
    return { success: true }
  })

  // ─── Пробрасываем события движка в Renderer ─────────────────
  engine.on('status', (status: string) => {
    const win = getMainWindow()
    if (win) {
      const mappedStatus = status === 'running' ? 'connected' :
                           status === 'starting' ? 'connecting' :
                           status === 'error' ? 'error' : 'disconnected'
      win.webContents.send('engine:status-changed', mappedStatus)
    }
  })

  engine.on('log', (entry: any) => {
    const win = getMainWindow()
    if (win) win.webContents.send('engine:log', entry)
  })

  // Telegram proxy events
  tgProxy.on('status', (status: string) => {
    const win = getMainWindow()
    if (win) win.webContents.send('tg-proxy:status-changed', status)
  })

  tgProxy.on('log', (entry: any) => {
    const win = getMainWindow()
    if (win) win.webContents.send('engine:log', entry)
  })
}
