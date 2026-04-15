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
import { promises as dnsPromises } from 'dns'
import { Strategy, buildStrategyArgs } from './strategy-pool'

export type EngineStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

// ─── Auto-bypass игровых серверов ─────────────────────────────────────────
// Домены, IP которых резолвятся и исключаются из захвата WinDivert.
// Пакеты к этим серверам идут мимо winws.exe → нет re-injection latency,
// нет таймаутов UserProxyApi/CareerApi/ReportPingData у PUBG и аналогичных.
const GAME_DOMAINS = [
  // PUBG / Krafton
  'api.pubg.com',
  'report-api.pubg.com',
  'prod.pubg.com',
  'prod-live-front.playbattlegrounds.com',
  'ki.playbattlegrounds.com',
  // Steam
  'api.steampowered.com',
  'store.steampowered.com',
  'community.steampowered.com',
  // Battle.net / Blizzard
  'us.actual.battle.net',
  'eu.actual.battle.net',
  // Epic Games
  'api.epicgames.dev',
  'www.epicgames.com',
]

const DNS_TIMEOUT_MS = 3000

/** Разрезолвить домены в A-записи с общим дедлайном. Не кидает ошибок. */
async function resolveGameIps(): Promise<string[]> {
  const collected = new Set<string>()

  const work = Promise.allSettled(
    GAME_DOMAINS.map(async (d) => {
      try {
        const addrs = await dnsPromises.resolve4(d)
        addrs.forEach((a) => collected.add(a))
      } catch {
        /* unresolved → просто пропускаем */
      }
    })
  )

  await Promise.race([
    work,
    new Promise((resolve) => setTimeout(resolve, DNS_TIMEOUT_MS)),
  ])

  return Array.from(collected)
}

/** Построить условие на диапазон/список портов для WinDivert-фильтра. */
function portsToFilter(ports: string, proto: 'tcp' | 'udp'): string {
  const parts = ports.split(',').map((p) => {
    if (p.includes('-')) {
      const [lo, hi] = p.split('-')
      return `(${proto}.DstPort >= ${lo} and ${proto}.DstPort <= ${hi})`
    }
    return `${proto}.DstPort == ${p}`
  })
  return parts.length > 1 ? '(' + parts.join(' or ') + ')' : parts[0]
}

/**
 * Заменить `--wf-tcp=X` / `--wf-udp=Y` на `--wf-raw=...` с исключением
 * IP-адресов игровых серверов. WinDivert не перехватывает эти пакеты —
 * они идут по стандартному сетевому пути без прохождения через winws.exe.
 */
function applyGameBypass(args: string[], excludedIps: string[]): string[] {
  if (excludedIps.length === 0) return args

  let wfTcp: string | null = null
  let wfUdp: string | null = null
  const out: string[] = []

  for (const a of args) {
    if (a.startsWith('--wf-tcp=')) {
      wfTcp = a.slice('--wf-tcp='.length)
      continue
    }
    if (a.startsWith('--wf-udp=')) {
      wfUdp = a.slice('--wf-udp='.length)
      continue
    }
    out.push(a)
  }

  if (!wfTcp && !wfUdp) return args

  const captureConds: string[] = []
  if (wfTcp) captureConds.push(`(tcp and ${portsToFilter(wfTcp, 'tcp')})`)
  if (wfUdp) captureConds.push(`(udp and ${portsToFilter(wfUdp, 'udp')})`)

  const exclusion = excludedIps.map((ip) => `ip.DstAddr == ${ip}`).join(' or ')
  const rawFilter = `(${captureConds.join(' or ')}) and not (${exclusion})`

  out.push(`--wf-raw=${rawFilter}`)
  return out
}

/** Выполнить системную команду, молча проглотив ошибку (нет процесса / нет сервиса). */
function execSilent(cmd: string, timeoutMs = 4000): void {
  try {
    execSync(cmd, { windowsHide: true, timeout: timeoutMs, stdio: 'ignore' })
  } catch {
    // ожидаемо: процесс/сервис отсутствует
  }
}

/**
 * Убить любые осиротевшие winws.exe по имени образа.
 * Срабатывает как safety-net если Electron упал без graceful shutdown —
 * иначе процесс остаётся в памяти и BattlEye/PUBG «виснут на инициализации».
 */
export function killOrphanWinws(): void {
  execSilent('taskkill /F /IM winws.exe /T')
}

/**
 * Выгрузить драйвер WinDivert (service) из ядра.
 *
 * КРИТИЧНО ДЛЯ ИГР С BATTLEYE/EAC (PUBG, Rainbow Six, Fortnite и т.д.):
 * BattlEye при инициализации сканирует активные kernel-drivers. WinDivert
 * — общий инструмент для manipulation трафика — флагается как подозрительный,
 * из-за чего игра виснет на «вечной инициализации». После `sc stop` драйвер
 * выгружается и античит снова стартует нормально.
 *
 * Требует admin (ZOVpret уже его требует для WinDivert).
 */
export function stopWinDivertService(): void {
  execSilent('sc stop WinDivert')
  execSilent('sc stop WinDivert64')
}

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
  private _restartTimeout: NodeJS.Timeout | null = null
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

    // Подчищаем осиротевшие winws.exe от предыдущей сессии (если Electron упал).
    // Без этого параллельно крутятся 2 winws и WinDivert может не освободиться.
    killOrphanWinws()

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
    let args = buildStrategyArgs(
      strategy,
      this.binPath + '\\',
      this.listsPath + '\\'
    )

    // Game bypass: резолвим IP PUBG/Steam/Epic/etc и исключаем их из
    // WinDivert-захвата через --wf-raw. Это устраняет таймауты игровых API
    // (`UserProxyApi@ReportPingData` и т.п.) при активном ZOVpret,
    // поскольку пакеты игр вообще не попадают в winws.exe.
    try {
      const gameIps = await resolveGameIps()
      if (gameIps.length > 0) {
        args = applyGameBypass(args, gameIps)
        this.log(
          'info',
          `Game bypass: исключены ${gameIps.length} IP игровых серверов из WinDivert`
        )
      } else {
        this.log('warn', 'Game bypass: не удалось разрезолвить ни одного домена — продолжаем без исключений')
      }
    } catch (err: any) {
      this.log('warn', `Game bypass: ошибка резолва — ${err.message}`)
    }

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
            this.log('warn', `Автоматический перезапуск (${this._restartCount}/${this._maxRestarts})...`)
            this._restartTimeout = setTimeout(() => {
              this._restartTimeout = null
              if (this._currentStrategy && this._status !== 'stopping') {
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
    this._currentStrategy = null
    
    if (this._restartTimeout) {
      clearTimeout(this._restartTimeout)
      this._restartTimeout = null
    }

    if (!this.process) {
      // Процесса нет, но драйвер WinDivert мог остаться загруженным от прошлой
      // сессии, либо завис осиротевший winws.exe — всё равно чистим систему.
      killOrphanWinws()
      stopWinDivertService()
      this.setStatus('stopped')
      return
    }

    this.setStatus('stopping')
    this.log('info', 'Остановка zapret...')

    const pid = this.process.pid

    return new Promise((resolve) => {
      const finalize = (msg: string): void => {
        // Safety-net: бьём по имени образа — убивает и трекнутый PID,
        // и любые осиротевшие winws.exe (например, от предыдущего краха).
        killOrphanWinws()
        // Выгружаем драйвер WinDivert — иначе BattlEye/EAC считают систему
        // скомпрометированной и блокируют запуск игры («вечная инициализация»).
        stopWinDivertService()
        this.process = null
        this.setStatus('stopped')
        this.log('info', msg)
        resolve()
      }

      const timeout = setTimeout(() => {
        // Force kill если не остановился за 5 секунд
        if (this.process && pid) {
          try {
            execSync(`taskkill /PID ${pid} /F /T`, { windowsHide: true })
          } catch {
            // ignore
          }
        }
        finalize('Zapret остановлен (force kill)')
      }, 5000)

      if (this.process) {
        this.process.on('exit', () => {
          clearTimeout(timeout)
          finalize('Zapret остановлен')
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
        finalize('Zapret остановлен')
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
