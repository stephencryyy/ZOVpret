// ============================================================================
// ZOVpret — Движок Zapret (управление winws.exe)
// ============================================================================
// Отвечает за запуск, мониторинг и остановку процесса winws.exe.
// Поддерживает переключение стратегий «на лету» и автоперезапуск при падении.
// ============================================================================

import { spawn, ChildProcess, execSync } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import { Strategy, buildStrategyArgs } from './strategy-pool'

export type EngineStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

export interface LogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

export class ZapretEngine extends EventEmitter {
  private process: ChildProcess | null = null
  private _status: EngineStatus = 'stopped'
  private _currentStrategy: Strategy | null = null
  private _logs: LogEntry[] = []
  private _startTime = 0
  private _restartCount = 0
  private _maxRestarts = 3
  private binPath: string
  private listsPath: string

  constructor(resourcesPath: string) {
    super()
    this.binPath = join(resourcesPath, 'bin')
    this.listsPath = join(resourcesPath, 'lists')
  }

  get status(): EngineStatus {
    return this._status
  }

  get currentStrategy(): Strategy | null {
    return this._currentStrategy
  }

  get logs(): LogEntry[] {
    return this._logs.slice(-500) // Последние 500 записей
  }

  get uptime(): number {
    return this._status === 'running' ? Date.now() - this._startTime : 0
  }

  get pid(): number | null {
    return this.process?.pid ?? null
  }

  /** Добавить запись в лог */
  private log(level: LogEntry['level'], message: string): void {
    const entry: LogEntry = { timestamp: Date.now(), level, message }
    this._logs.push(entry)
    if (this._logs.length > 1000) this._logs.shift()
    this.emit('log', entry)
  }

  /** Установить статус */
  private setStatus(status: EngineStatus): void {
    this._status = status
    this.emit('status', status)
  }

  /** Проверить наличие winws.exe */
  checkBinaries(): boolean {
    const winwsPath = join(this.binPath, 'winws.exe')
    const exists = existsSync(winwsPath)
    if (!exists) {
      this.log('error', 'winws.exe не найден. Запустите обновление бинарников.')
    }
    return exists
  }

  /**
   * Запустить winws.exe с указанной стратегией
   */
  async start(strategy: Strategy): Promise<void> {
    if (this._status === 'running' || this._status === 'starting') {
      await this.stop()
    }

    if (!this.checkBinaries()) {
      this.setStatus('error')
      throw new Error('Бинарники zapret не найдены')
    }

    this.setStatus('starting')
    this._currentStrategy = strategy
    this._restartCount = 0

    this.log('info', `Запуск стратегии: ${strategy.name}`)

    await this.spawnProcess(strategy)
  }

  /** Спавн процесса winws.exe */
  private async spawnProcess(strategy: Strategy): Promise<void> {
    const winwsPath = join(this.binPath, 'winws.exe')
    
    // Подставляем реальные пути в аргументы
    const args = buildStrategyArgs(
      strategy,
      this.binPath + '\\',
      this.listsPath + '\\'
    )

    this.log('debug', `Команда: ${winwsPath} ${args.join(' ')}`)

    try {
      this.process = spawn(winwsPath, args, {
        cwd: this.binPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })

      this.process.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString().trim()
        if (msg) this.log('info', msg)
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim()
        if (msg) this.log('warn', msg)
      })

      this.process.on('error', (err) => {
        this.log('error', `Ошибка процесса: ${err.message}`)
        this.setStatus('error')
      })

      this.process.on('exit', (code, signal) => {
        this.log('info', `Процесс завершён: code=${code}, signal=${signal}`)
        this.process = null

        if (this._status !== 'stopping') {
          // Неожиданное завершение — попытка перезапуска
          if (this._restartCount < this._maxRestarts) {
            this._restartCount++
            this.log('warn', `Автоматический перезапуск (${this._restartCount}/${this._maxRestarts})...`)
            setTimeout(() => {
              if (this._currentStrategy) {
                this.spawnProcess(this._currentStrategy)
              }
            }, 2000)
          } else {
            this.log('error', 'Превышено максимальное количество перезапусков')
            this.setStatus('error')
          }
        } else {
          this.setStatus('stopped')
        }
      })

      // Ждём 1 секунду и проверяем, что процесс не упал
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (this.process && !this.process.killed) {
            this._startTime = Date.now()
            this.setStatus('running')
            this.log('info', `✓ Стратегия "${strategy.name}" активна (PID: ${this.process.pid})`)
            resolve()
          } else {
            reject(new Error('Процесс winws.exe завершился сразу после запуска'))
          }
        }, 1500)

        this.process?.on('exit', () => {
          clearTimeout(timeout)
          // exit обработает логику выше
          resolve()
        })
      })
    } catch (err: any) {
      this.log('error', `Не удалось запустить winws.exe: ${err.message}`)
      this.setStatus('error')
      throw err
    }
  }

  /** Остановить движок */
  async stop(): Promise<void> {
    if (!this.process) {
      this.setStatus('stopped')
      return
    }

    this.setStatus('stopping')
    this.log('info', 'Остановка zapret...')

    const pid = this.process.pid

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill если не остановился за 5 секунд
        if (this.process && pid) {
          try {
            execSync(`taskkill /PID ${pid} /F /T`, { windowsHide: true })
          } catch {
            // ignore
          }
          this.process = null
        }
        this.setStatus('stopped')
        this.log('info', 'Zapret остановлен (force kill)')
        resolve()
      }, 5000)

      if (this.process) {
        this.process.on('exit', () => {
          clearTimeout(timeout)
          this.process = null
          this.setStatus('stopped')
          this.log('info', 'Zapret остановлен')
          resolve()
        })

        // Попробуем graceful shutdown
        try {
          this.process.kill('SIGTERM')
        } catch {
          if (pid) {
            try {
              execSync(`taskkill /PID ${pid} /F /T`, { windowsHide: true })
            } catch {
              // ignore
            }
          }
        }
      } else {
        clearTimeout(timeout)
        this.setStatus('stopped')
        resolve()
      }
    })
  }

  /** Перезапуск с текущей стратегией */
  async restart(): Promise<void> {
    if (this._currentStrategy) {
      await this.stop()
      await this.start(this._currentStrategy)
    }
  }

  /** Очистить логи */
  clearLogs(): void {
    this._logs = []
  }
}
