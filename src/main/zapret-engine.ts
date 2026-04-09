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
  private _logs: LogEntry[] = new Array(1000)
  private _logWriteIdx = 0
  private _logCount = 0
  private _startTime = 0
  private _restartCount = 0
  private _maxRestarts = 3
  private _restartTimeout: NodeJS.Timeout | null = null
  private _operationId = 0 // Guard для race condition при start/stop
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
    const cap = 1000
    if (this._logCount <= cap) {
      return this._logs.slice(0, this._logCount)
    }
    // Circular buffer: вернуть в порядке от старых к новым
    return [
      ...this._logs.slice(this._logWriteIdx),
      ...this._logs.slice(0, this._logWriteIdx)
    ]
  }

  get uptime(): number {
    return this._status === 'running' ? Date.now() - this._startTime : 0
  }

  get pid(): number | null {
    return this.process?.pid ?? null
  }

  /** Добавить запись в лог (circular buffer — O(1)) */
  private log(level: LogEntry['level'], message: string): void {
    const entry: LogEntry = { timestamp: Date.now(), level, message }
    this._logs[this._logWriteIdx] = entry
    this._logWriteIdx = (this._logWriteIdx + 1) % 1000
    this._logCount++
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
    // Инкрементируем ID операции — все предыдущие авто-рестарты будут проигнорированы
    const opId = ++this._operationId

    if (this._status === 'running' || this._status === 'starting') {
      await this.stop()
    }

    // Если за время stop() начался другой start(), выходим
    if (opId !== this._operationId) return

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

    // Флаг: процесс не смог запуститься (EACCES и т.п.)
    let spawnFailed = false

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
        spawnFailed = true

        if (err.message.includes('EACCES') || err.message.includes('EPERM')) {
          this.log('error', '⚠ Нет прав администратора! Запустите приложение от имени администратора (Run as Administrator).')
          this.log('error', 'WinDivert требует повышенных привилегий для перехвата трафика.')
        } else {
          this.log('error', `Ошибка процесса: ${err.message}`)
        }

        this.process = null
        this.setStatus('error')
      })

      this.process.on('exit', (code, signal) => {
        this.log('info', `Процесс завершён: code=${code}, signal=${signal}`)
        this.process = null

        if (this._status !== 'stopping' && !spawnFailed) {
          // Неожиданное завершение — попытка перезапуска
          if (this._restartCount < this._maxRestarts) {
            this._restartCount++
            const currentOpId = this._operationId
            this.log('warn', `Автоматический перезапуск (${this._restartCount}/${this._maxRestarts})...`)
            this._restartTimeout = setTimeout(() => {
              this._restartTimeout = null
              // Проверяем, что не начался другой start() за время ожидания
              if (currentOpId === this._operationId && this._currentStrategy && this._status !== 'stopping') {
                this.spawnProcess(this._currentStrategy)
              }
            }, 2000)
          } else {
            this.log('error', 'Превышено максимальное количество перезапусков')
            this.setStatus('error')
          }
        } else if (this._status === 'stopping') {
          this.setStatus('stopped')
        }
      })

      // Ждём 1.5 сек и проверяем, что процесс реально работает
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          // Проверяем: процесс жив И PID существует И не было ошибки spawn
          if (this.process && !this.process.killed && this.process.pid && !spawnFailed) {
            this._startTime = Date.now()
            this.setStatus('running')
            this.log('info', `✓ Стратегия "${strategy.name}" активна (PID: ${this.process.pid})`)
            resolve()
          } else if (spawnFailed) {
            // EACCES / EPERM — не пытаемся перезапускать
            reject(new Error('Нет прав администратора для запуска winws.exe'))
          } else {
            reject(new Error('Процесс winws.exe завершился сразу после запуска'))
          }
        }, 1500)

        this.process?.on('exit', () => {
          clearTimeout(timeout)
          resolve()
        })

        this.process?.on('error', () => {
          clearTimeout(timeout)
          resolve() // Ошибка уже обработана в on('error')
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
    // Инкрементируем operationId, чтобы отменить запланированные рестарты
    this._operationId++
    this._currentStrategy = null

    if (this._restartTimeout) {
      clearTimeout(this._restartTimeout)
      this._restartTimeout = null
    }

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
    this._logs = new Array(1000)
    this._logWriteIdx = 0
    this._logCount = 0
  }
}
