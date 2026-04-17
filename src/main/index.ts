// ============================================================================
// ZOVpret — Точка входа Main Process
// ============================================================================

import { app, BrowserWindow, shell, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ZapretEngine } from './zapret-engine'
import { TgProxyEngine } from './tg-proxy-engine'
import { AppUpdater } from './app-updater'
import { registerIpcHandlers } from './ipc-handlers'
import { getConfig, setConfig } from './config-store'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

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

/** Создать системный трей */
function createTray(engine: ZapretEngine): void {
  const iconPath = join(__dirname, '../../build/icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('ZOVpret')

  const updateTrayMenu = (): void => {
    const isRunning = engine.status === 'running'
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'ZOVpret',
        enabled: false
      },
      { type: 'separator' },
      {
        label: isRunning ? 'Подключено' : 'Отключено',
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Показать',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        }
      },
      { type: 'separator' },
      {
        label: 'Выход',
        click: () => {
          mainWindow?.destroy()
          app.quit()
        }
      }
    ])
    tray?.setContextMenu(contextMenu)
  }

  updateTrayMenu()
  engine.on('status', () => updateTrayMenu())

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

/** Настроить автозапуск */
function setupAutoStart(): void {
  const config = getConfig()
  app.setLoginItemSettings({
    openAtLogin: config.autoStart,
    args: config.startMinimized ? ['--minimized'] : []
  })
}

// ─── Инициализация приложения ─────────────────────────────────
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.zovpret.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const resourcesPath = getResourcesPath()
  const engine = new ZapretEngine(resourcesPath)
  const tgProxy = new TgProxyEngine(resourcesPath)
  const appUpdater = new AppUpdater()

  createWindow()

  // Системный трей
  createTray(engine)

  // Автозапуск
  setupAutoStart()

  // Если запущено с --minimized, скрываем окно
  if (process.argv.includes('--minimized')) {
    mainWindow?.hide()
  }

  // Регистрируем IPC
  registerIpcHandlers(engine, tgProxy, appUpdater, resourcesPath, () => mainWindow)

  // Запускаем периодическую проверку обновлений (только в prod)
  if (!is.dev) {
    appUpdater.startPeriodicCheck()
  }

  // IPC для управления окном
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:close', () => {
    // Сворачиваем в трей вместо закрытия
    mainWindow?.hide()
  })

  // IPC для обновления autoStart
  ipcMain.handle('config:autostart', (_event, enabled: boolean) => {
    setConfig({ autoStart: enabled })
    app.setLoginItemSettings({
      openAtLogin: enabled,
      args: getConfig().startMinimized ? ['--minimized'] : []
    })
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

  app.on('before-quit', async () => {
    if (engine.status === 'running') {
      await engine.stop()
    }
    if (tgProxy.status === 'running') {
      await tgProxy.stop()
    }
  })
})

app.on('window-all-closed', () => {
  // Не закрываем приложение — работаем в трее
})
