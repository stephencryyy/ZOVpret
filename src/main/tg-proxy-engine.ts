// ============================================================================
// ZOVpret — Движок Telegram WS Proxy (управление TgWsProxy)
// ============================================================================
// Запускает и останавливает локальный MTProto WS прокси для Telegram Desktop.
// Использует бинарник TgWsProxy_windows.exe из ресурсов приложения.
// ============================================================================

import { spawn, ChildProcess, execSync } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import { randomBytes } from 'crypto'

export type TgProxyStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface TgProxyInfo {
  status: TgProxyStatus
  host: string
  port: number
  secret: string
  tgLink: string
}

export class TgProxyEngine extends EventEmitter {
  private process: ChildProcess | null = null
  private _status: TgProxyStatus = 'stopped'
  private _host = '127.0.0.1'
  private _port = 1443
  private _secret: string
  private binPath: string
  private _restartCount = 0
  private _maxRestarts = 3
  private _restartTimeout: NodeJS.Timeout | null = null

  constructor(resourcesPath: string) {
    super()
    this.binPath = join(resourcesPath, 'bin')
    // Генерируем secret один раз при создании
    this._secret = randomBytes(16).toString('hex')
  }

  get status(): TgProxyStatus {
    return this._status
  }

  get info(): TgProxyInfo {
    return {
      status: this._status,
      host: this._host,
      port: this._port,
      secret: this._secret,
      tgLink: `tg://proxy?server=${this._host}&port=${this._port}&secret=dd${this._secret}`
    }
  }

  /** Проверить наличие TgWsProxy */
  private getExePath(): string | null {
    const names = ['TgWsProxy_windows.exe', 'TgWsProxy.exe', 'tg-ws-proxy.exe']
    for (const name of names) {
      const p = join(this.binPath, name)
      if (existsSync(p)) return p
    }
    return null
  }

  /** Проверить, установлен ли TgWsProxy */
  isInstalled(): boolean {
    return this.getExePath() !== null
  }

  /** Запустить TgWsProxy */
  async start(): Promise<void> {
    if (this._status === 'running' || this._status === 'starting') {
      await this.stop()
    }

    this._restartCount = 0
    await this.doSpawn()
  }

  /** Внутренний метод спавна процесса (используется при авто-рестарте) */
  private async doSpawn(): Promise<void> {
    const exePath = this.getExePath()
    if (!exePath) {
      this._status = 'error'
      this.emit('status', this._status)
      throw new Error('TgWsProxy не найден. Скачайте его из настроек.')
    }

    this._status = 'starting'
    this.emit('status', this._status)

    try {
      // Запускаем в консольном режиме с нашими параметрами
      this.process = spawn(exePath, [
        '--port', String(this._port),
        '--host', this._host,
        '--secret', this._secret,
      ], {
        cwd: this.binPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })

      this.process.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString().trim()
        if (msg) this.emit('log', { level: 'info', message: `[TgProxy] ${msg}` })
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim()
        if (msg) this.emit('log', { level: 'warn', message: `[TgProxy] ${msg}` })
      })

      this.process.on('error', (err) => {
        this.emit('log', { level: 'error', message: `[TgProxy] Ошибка: ${err.message}` })
        this.process = null
        this._status = 'error'
        this.emit('status', this._status)
      })

      this.process.on('exit', (code) => {
        this.emit('log', { level: 'info', message: `[TgProxy] Процесс завершён: code=${code}` })
        this.process = null

        if (this._status !== 'stopped') {
          // Неожиданное завершение — попытка перезапуска
          if (this._restartCount < this._maxRestarts) {
            this._restartCount++
            this.emit('log', {
              level: 'warn',
              message: `[TgProxy] Автоматический перезапуск (${this._restartCount}/${this._maxRestarts})...`
            })
            this._restartTimeout = setTimeout(() => {
              this._restartTimeout = null
              if (this._status !== 'stopped') {
                this.doSpawn()
              }
            }, 2000)
          } else {
            this.emit('log', { level: 'error', message: '[TgProxy] Превышено максимальное количество перезапусков' })
            this._status = 'error'
            this.emit('status', this._status)
          }
        }
      })

      // Ждём немного, проверяем что процесс живой
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (this.process && !this.process.killed && this.process.pid) {
            this._status = 'running'
            this.emit('status', this._status)
            this.emit('log', {
              level: 'info',
              message: `[TgProxy] Запущен на ${this._host}:${this._port} (PID: ${this.process.pid})`
            })
          }
          resolve()
        }, 1500)
      })
    } catch (err: any) {
      this._status = 'error'
      this.emit('status', this._status)
      throw err
    }
  }

  /** Остановить TgWsProxy */
  async stop(): Promise<void> {
    if (this._restartTimeout) {
      clearTimeout(this._restartTimeout)
      this._restartTimeout = null
    }

    if (!this.process) {
      this._status = 'stopped'
      this.emit('status', this._status)
      return
    }

    const pid = this.process.pid
    this._status = 'stopped'
    this.emit('status', this._status)

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.process && pid) {
          try {
            execSync(`taskkill /PID ${pid} /F /T`, { windowsHide: true })
          } catch { /* ignore */ }
          this.process = null
        }
        resolve()
      }, 3000)

      if (this.process) {
        this.process.on('exit', () => {
          clearTimeout(timeout)
          this.process = null
          resolve()
        })
        try {
          this.process.kill('SIGTERM')
        } catch {
          if (pid) {
            try { execSync(`taskkill /PID ${pid} /F /T`, { windowsHide: true }) }
            catch { /* ignore */ }
          }
        }
      } else {
        clearTimeout(timeout)
        resolve()
      }
    })
  }
}
