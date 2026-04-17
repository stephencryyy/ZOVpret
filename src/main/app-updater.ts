// ============================================================================
// ZOVpret — Автообновление приложения
// ============================================================================
// Обёртка над electron-updater. Проверяет релизы ZOVpret на GitHub,
// скачивает новые версии и устанавливает их при перезапуске.
// ============================================================================

import { EventEmitter } from 'events'
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'

/** Интервал периодической проверки обновлений (4 часа) */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

/** Задержка первой проверки после запуска (10 секунд) */
const INITIAL_CHECK_DELAY_MS = 10 * 1000

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface AppUpdateState {
  status: AppUpdateStatus
  currentVersion: string
  newVersion?: string
  releaseNotes?: string
  progress?: {
    percent: number
    bytesPerSecond: number
    transferred: number
    total: number
  }
  error?: string
}

export class AppUpdater extends EventEmitter {
  private _state: AppUpdateState
  private _intervalHandle: NodeJS.Timeout | null = null
  private _initialTimeout: NodeJS.Timeout | null = null

  constructor() {
    super()

    // Не скачиваем автоматически — только по согласию пользователя
    autoUpdater.autoDownload = false
    // Устанавливаем на выходе, если обновление было скачано
    autoUpdater.autoInstallOnAppQuit = true
    // Разрешаем preview/beta только если версия приложения уже preview
    autoUpdater.allowPrerelease = false

    this._state = {
      status: 'idle',
      currentVersion: autoUpdater.currentVersion.version
    }

    this.bindEvents()
  }

  get state(): AppUpdateState {
    return this._state
  }

  /** Привязка событий autoUpdater к внутреннему состоянию */
  private bindEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      this.setState({ status: 'checking' })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.setState({
        status: 'available',
        newVersion: info.version,
        releaseNotes: typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : undefined
      })
    })

    autoUpdater.on('update-not-available', () => {
      this.setState({ status: 'not-available' })
    })

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.setState({
        status: 'downloading',
        progress: {
          percent: Math.round(progress.percent),
          bytesPerSecond: Math.round(progress.bytesPerSecond),
          transferred: progress.transferred,
          total: progress.total
        }
      })
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.setState({
        status: 'downloaded',
        newVersion: info.version
      })
    })

    autoUpdater.on('error', (err: Error) => {
      this.setState({
        status: 'error',
        error: err?.message || String(err)
      })
    })
  }

  private setState(patch: Partial<AppUpdateState>): void {
    this._state = { ...this._state, ...patch }
    this.emit('state', this._state)
  }

  /** Запустить периодическую проверку (первая через 10с, затем каждые 4 часа) */
  startPeriodicCheck(): void {
    if (this._initialTimeout || this._intervalHandle) return

    this._initialTimeout = setTimeout(() => {
      this._initialTimeout = null
      this.checkNow().catch(() => { /* ошибки уже залогированы в state */ })

      this._intervalHandle = setInterval(() => {
        this.checkNow().catch(() => {})
      }, CHECK_INTERVAL_MS)
    }, INITIAL_CHECK_DELAY_MS)
  }

  /** Остановить периодическую проверку */
  stopPeriodicCheck(): void {
    if (this._initialTimeout) {
      clearTimeout(this._initialTimeout)
      this._initialTimeout = null
    }
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle)
      this._intervalHandle = null
    }
  }

  /** Проверить наличие обновления сейчас */
  async checkNow(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates()
    } catch (err: any) {
      this.setState({ status: 'error', error: err?.message || String(err) })
    }
  }

  /** Скачать обновление (только после 'available') */
  async downloadUpdate(): Promise<void> {
    if (this._state.status !== 'available' && this._state.status !== 'error') return
    try {
      await autoUpdater.downloadUpdate()
    } catch (err: any) {
      this.setState({ status: 'error', error: err?.message || String(err) })
    }
  }

  /** Перезапустить приложение и установить обновление */
  quitAndInstall(): void {
    if (this._state.status === 'downloaded') {
      autoUpdater.quitAndInstall(true, true)
    }
  }
}
