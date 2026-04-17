// ============================================================================
// ZOVpret — IPC обработчики (мост между Main и Renderer)
// ============================================================================

import { ipcMain, BrowserWindow, shell, app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ZapretEngine } from './zapret-engine'
import { TgProxyEngine } from './tg-proxy-engine'
import { AppUpdater } from './app-updater'
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
  appUpdater: AppUpdater,
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

  ipcMain.handle('strategies:set', async (_event, id: unknown) => {
    if (typeof id !== 'string' || !/^[a-z0-9_-]+$/.test(id)) {
      throw new Error('Некорректный ID стратегии')
    }

    if (id === 'auto' || id === 'auto-deep') {
      setConfig({ lastStrategyId: id })
      return
    }

    const strategy = getStrategyById(id)
    if (!strategy) throw new Error(`Стратегия ${id} не найдена`)

    setConfig({ lastStrategyId: id })

    if (engine.status === 'running') {
      await engine.start(strategy)
    }
  })

  // ─── Настройки ──────────────────────────────────────────────
  ipcMain.handle('config:get', () => getConfig())

  const ALLOWED_CONFIG_KEYS = new Set([
    'lastStrategyId', 'filterMode', 'autoUpdate', 'binVersion',
    'customDomains', 'autoStart', 'startMinimized', 'logLevel'
  ])

  ipcMain.handle('config:set', (_event, partial: unknown) => {
    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
      throw new Error('Некорректные данные настроек')
    }
    // Фильтруем только разрешённые ключи
    const sanitized: Record<string, any> = {}
    for (const [key, value] of Object.entries(partial as Record<string, unknown>)) {
      if (ALLOWED_CONFIG_KEYS.has(key)) {
        sanitized[key] = value
      }
    }
    setConfig(sanitized)
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

  // ─── Версия приложения ───────────────────────────────────────
  ipcMain.handle('app:version', () => app.getVersion())

  // ─── Управление списками доменов ────────────────────────────
  const listsPath = join(resourcesPath, 'lists')

  ipcMain.handle('domains:get-custom', () => {
    try {
      const content = readFileSync(join(listsPath, 'list-general-user.txt'), 'utf-8')
      return content.split('\n').map(l => l.trim()).filter(Boolean)
    } catch { return [] }
  })

  ipcMain.handle('domains:set-custom', (_event, domains: unknown) => {
    if (!Array.isArray(domains)) throw new Error('Некорректный формат доменов')
    const safe = (domains as string[])
      .map(d => String(d).trim().toLowerCase())
      .filter(d => /^[a-z0-9.-]+$/.test(d))
    writeFileSync(join(listsPath, 'list-general-user.txt'), safe.join('\n') + '\n', 'utf-8')
    return safe
  })

  ipcMain.handle('domains:get-exclude', () => {
    try {
      const content = readFileSync(join(listsPath, 'list-exclude-user.txt'), 'utf-8')
      return content.split('\n').map(l => l.trim()).filter(Boolean)
    } catch { return [] }
  })

  ipcMain.handle('domains:set-exclude', (_event, domains: unknown) => {
    if (!Array.isArray(domains)) throw new Error('Некорректный формат доменов')
    const safe = (domains as string[])
      .map(d => String(d).trim().toLowerCase())
      .filter(d => /^[a-z0-9.-]+$/.test(d))
    writeFileSync(join(listsPath, 'list-exclude-user.txt'), safe.join('\n') + '\n', 'utf-8')
    return safe
  })

  // ─── Тест соединения ─────────────────────────────────────────
  ipcMain.handle('engine:test-connection', async () => {
    // Делаем HTTP тесты напрямую (не трогая движок)
    const https = require('https')
    const TEST_URLS = [
      { hostname: 'www.youtube.com', path: '/', name: 'YouTube' },
      { hostname: 'discord.com', path: '/', name: 'Discord' },
      { hostname: 'web.telegram.org', path: '/', name: 'Telegram' },
      { hostname: 'www.instagram.com', path: '/', name: 'Instagram' },
      { hostname: 'x.com', path: '/', name: 'X (Twitter)' }
    ]

    const results = await Promise.all(TEST_URLS.map(u => {
      return new Promise<{ name: string; success: boolean; latencyMs: number }>((resolve) => {
        const start = Date.now()
        const timeout = setTimeout(() => {
          resolve({ name: u.name, success: false, latencyMs: 4000 })
        }, 4000)

        const req = https.get({
          hostname: u.hostname,
          path: u.path,
          port: 443,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 4000
        }, (res: any) => {
          clearTimeout(timeout)
          const latencyMs = Date.now() - start
          const success = (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 400
          res.destroy()
          resolve({ name: u.name, success, latencyMs })
        })
        req.on('error', () => {
          clearTimeout(timeout)
          resolve({ name: u.name, success: false, latencyMs: Date.now() - start })
        })
        req.on('timeout', () => {
          clearTimeout(timeout)
          req.destroy()
          resolve({ name: u.name, success: false, latencyMs: 4000 })
        })
      })
    }))

    return results
  })

  // ─── Автообновление приложения ───────────────────────────────
  ipcMain.handle('app-update:check', async () => {
    await appUpdater.checkNow()
    return appUpdater.state
  })

  ipcMain.handle('app-update:download', async () => {
    await appUpdater.downloadUpdate()
    return appUpdater.state
  })

  ipcMain.handle('app-update:install', () => {
    appUpdater.quitAndInstall()
  })

  ipcMain.handle('app-update:state', () => appUpdater.state)

  // Пробрасываем события обновления приложения в renderer
  appUpdater.on('state', (state) => {
    const win = getMainWindow()
    if (win) win.webContents.send('app-update:state-changed', state)
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
