// ============================================================================
// ZOVpret — Точка входа Main Process
// ============================================================================

import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ZapretEngine, killOrphanWinws, stopWinDivertService } from './zapret-engine'
import { TgProxyEngine, killOrphanTgProxy } from './tg-proxy-engine'
import { registerIpcHandlers } from './ipc-handlers'

/**
 * Полная системная зачистка: убивает winws.exe, TgWsProxy и выгружает
 * драйвер WinDivert. Вызывается при старте (чтобы убрать следы краха
 * прошлой сессии) и при выходе (чтобы BattlEye/EAC не видели драйвер).
 *
 * Без этой очистки PUBG и другие игры с BattlEye залипают на «вечной
 * инициализации», пока пользователь вручную не удалит %LOCALAPPDATA%\BattlEye.
 */
function fullSystemCleanup(): void {
  killOrphanWinws()
  killOrphanTgProxy()
  stopWinDivertService()
}

let mainWindow: BrowserWindow | null = null

/** Путь к ресурсам (бинарники, списки) */
function getResourcesPath(): string {
  const devPath = join(__dirname, '../../resources')
  const prodPath = join(process.resourcesPath, 'resources')
  const resourcesPath = is.dev ? devPath : prodPath

  const dirs = [
    resourcesPath,
    join(resourcesPath, 'bin'),
    join(resourcesPath, 'lists')
  ]
  for (const dir of dirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  return resourcesPath
}

/**
 * Загрузить URL с повторами — решает race condition между Vite и Electron.
 * Вместо HTTP-проверки просто пробуем loadURL несколько раз.
 */
async function loadUrlWithRetry(
  win: BrowserWindow,
  url: string,
  maxRetries = 20,
  delayMs = 1000
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await win.loadURL(url)
      console.log(`[ZOVpret] UI loaded successfully (attempt ${i + 1})`)
      return
    } catch (err) {
      console.log(`[ZOVpret] Attempt ${i + 1}/${maxRetries} - waiting for dev server...`)
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  console.error('[ZOVpret] Failed to load renderer after all retries')
}

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 680,
    minWidth: 420,
    minHeight: 680,
    maxWidth: 420,
    maxHeight: 680,
    resizable: false,
    frame: false,
    transparent: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#07070d',
    icon: join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  return mainWindow
}

// ─── Инициализация приложения ─────────────────────────────────
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.zovpret.app')

  // Превентивная зачистка: если прошлый запуск упал без корректного выхода,
  // в системе могли остаться winws.exe и загруженный WinDivert-драйвер —
  // это ломает запуск игр с BattlEye (PUBG). Выметаем до старта движков.
  console.log('[ZOVpret] Startup cleanup: orphan processes + WinDivert driver')
  fullSystemCleanup()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const resourcesPath = getResourcesPath()
  const engine = new ZapretEngine(resourcesPath)
  const tgProxy = new TgProxyEngine(resourcesPath)

  createWindow()

  // Регистрируем IPC
  registerIpcHandlers(engine, tgProxy, resourcesPath, () => mainWindow)

  // IPC для управления окном
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:close', () => {
    // before-quit сам выполнит cleanup (останов движков + выгрузка WinDivert).
    app.quit()
  })

  // Загружаем UI
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    // Dev: retry загрузку до тех пор пока Vite сервер не станет доступен
    const url = process.env['ELECTRON_RENDERER_URL']
    console.log(`[ZOVpret] Dev server URL: ${url}`)
    await loadUrlWithRetry(mainWindow!, url)
  } else {
    // Production: загружаем из файла
    await mainWindow!.loadFile(join(__dirname, '../renderer/index.html'))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  // Флаг: уже начали асинхронный shutdown (иначе before-quit запустится дважды
  // из-за app.exit в конце).
  let shuttingDown = false
  app.on('before-quit', (event) => {
    if (shuttingDown) return
    shuttingDown = true
    // Блокируем немедленный выход — даём время остановить процессы
    // и выгрузить драйвер WinDivert. Иначе BattlEye «видит» драйвер
    // до следующей перезагрузки и PUBG не стартует.
    event.preventDefault()

    void (async () => {
      try {
        await Promise.allSettled([engine.stop(), tgProxy.stop()])
      } finally {
        // Финальный sweep на случай, если stop() не успел по таймауту.
        fullSystemCleanup()
        // Выходим напрямую — before-quit больше не должен срабатывать.
        app.exit(0)
      }
    })()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
