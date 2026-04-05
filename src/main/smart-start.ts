// ============================================================================
// ZOVpret — Smart Start (Автоматический подбор стратегии)
// ============================================================================
// Последовательно тестирует стратегии из пула, делая HTTPS-запрос к тестовому
// домену через запущенный winws.exe. Первая стратегия, через которую удалось
// получить HTTP 200, считается рабочей и сохраняется.
// ============================================================================

import { EventEmitter } from 'events'
import https from 'https'
import { ZapretEngine } from './zapret-engine'
import { STRATEGIES, Strategy } from './strategy-pool'
import { setConfig } from './config-store'

/** Тестовые домены для проверки. */
const TEST_URLS = [
  { hostname: 'www.youtube.com', path: '/', name: 'YouTube' },
  { hostname: 'discord.com', path: '/', name: 'Discord' },
  { hostname: 'web.telegram.org', path: '/', name: 'Telegram' },
  { hostname: 'www.instagram.com', path: '/', name: 'Instagram' }
]

/** Таймаут на тест одной стратегии (мс) */
const TEST_TIMEOUT = 8000

/** Задержка после запуска winws перед тестом (мс) */
const START_DELAY = 2500

export interface SmartStartProgress {
  current: number
  total: number
  strategyName: string
  status: 'testing' | 'success' | 'failed'
}

export interface SmartStartResult {
  success: boolean
  strategy: Strategy | null
  latencyMs: number
  score: number
  error?: string
}

export class SmartStart extends EventEmitter {
  private engine: ZapretEngine
  private aborted = false

  constructor(engine: ZapretEngine) {
    super()
    this.engine = engine
  }

  /**
   * Запускает процесс автоматического подбора стратегии.
   */
  async run(deepAnalysis: boolean = false): Promise<SmartStartResult> {
    this.aborted = false
    const total = STRATEGIES.length

    let bestStrategy: Strategy | null = null
    let bestScore = -1
    let bestLatency = Infinity

    for (let i = 0; i < STRATEGIES.length; i++) {
      if (this.aborted) break

      const strategy = STRATEGIES[i]

      this.emit('progress', {
        current: i + 1,
        total,
        strategyName: strategy.name,
        status: 'testing'
      } as SmartStartProgress)

      try {
        // 1. Запустить winws с текущей стратегией
        await this.engine.start(strategy)

        // 2. Подождать, пока winws полностью инициализируется
        await this.delay(START_DELAY)

        // 3. Проверить статус — если process упал, пропускаем
        if (this.engine.status !== 'running') {
          this.emit('progress', {
            current: i + 1,
            total,
            strategyName: strategy.name,
            status: 'failed'
          })
          continue
        }

        // 4. Тестировать HTTPS-запросы к доменам параллельно
        const { score, avgLatency } = await this.testConnection()

        if (score > 0) {
          // Стратегия работает хотя бы для одного сайта
          if (score > bestScore || (score === bestScore && avgLatency < bestLatency)) {
            bestScore = score
            bestLatency = avgLatency
            bestStrategy = strategy
          }

          // Fast-track: если не нужен глубокий анализ и найден идеальный (4/4) кандидат
          if (!deepAnalysis && score === TEST_URLS.length) {
            this.emit('progress', {
              current: i + 1,
              total,
              strategyName: strategy.name,
              status: 'success'
            })
            setConfig({ lastStrategyId: strategy.id })
            return {
              success: true,
              strategy,
              latencyMs: avgLatency,
              score
            }
          }
        }

        // Стратегия не идеальна (или глубокий анализ) — останавливаем и пробуем следующую
        await this.engine.stop()
        await this.delay(500) // Ждём корректного освобождения WinDivert OS

      } catch (err: any) {
        // Ошибка при тесте — продолжаем со следующей
        this.emit('progress', {
          current: i + 1,
          total,
          strategyName: strategy.name,
          status: 'failed'
        })
        try { 
          await this.engine.stop() 
          await this.delay(500) // Ждём освобождения
        } catch { /* ignore */ }
      }
    }

    // После завершения всех тестов проверяем, нашли ли мы хоть что-то
    if (bestStrategy) {
      this.emit('progress', {
        current: total,
        total,
        strategyName: bestStrategy.name,
        status: 'success'
      })
      setConfig({ lastStrategyId: bestStrategy.id })
      try {
        await this.engine.start(bestStrategy)
      } catch (err) {
        // ignore
      }
      return {
        success: true,
        strategy: bestStrategy,
        latencyMs: bestLatency,
        score: bestScore
      }
    }

    // Ни одна стратегия не сработала
    return {
      success: false,
      strategy: null,
      latencyMs: 0,
      score: 0,
      error: 'Ни одна из стратегий не сработала. Попробуйте позже или настройте вручную.'
    }
  }

  /** Отменить подбор */
  abort(): void {
    this.aborted = true
    this.engine.stop().catch(() => {})
  }

  /**
   * Тестирование соединения (параллельно).
   * Возвращает количество успешных ответов (score) и средний пинг к ним.
   */
  private async testConnection(): Promise<{ score: number; avgLatency: number }> {
    const promises = TEST_URLS.map(u => this.httpsGet(u.hostname, u.path))
    const results = await Promise.all(promises)

    const successful = results.filter(r => r.success)
    const score = successful.length

    let avgLatency = Infinity
    if (score > 0) {
      const totalPing = successful.reduce((acc, curr) => acc + curr.latencyMs, 0)
      avgLatency = Math.round(totalPing / score)
    }

    return { score, avgLatency }
  }

  /** Выполнить HTTPS GET-запрос */
  private httpsGet(
    hostname: string,
    path: string
  ): Promise<{ success: boolean; latencyMs: number }> {
    return new Promise((resolve) => {
      const start = Date.now()
      const timeout = setTimeout(() => {
        resolve({ success: false, latencyMs: TEST_TIMEOUT })
      }, TEST_TIMEOUT)

      const req = https.get(
        {
          hostname,
          path,
          port: 443,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
          },
          timeout: TEST_TIMEOUT
        },
        (res) => {
          clearTimeout(timeout)
          const latencyMs = Date.now() - start
          const statusCode = res.statusCode || 0
          // 200, 301, 302 — считаем успехом (сервер ответил)
          const success = statusCode >= 200 && statusCode < 400
          res.destroy()
          resolve({ success, latencyMs })
        }
      )

      req.on('error', () => {
        clearTimeout(timeout)
        resolve({ success: false, latencyMs: Date.now() - start })
      })

      req.on('timeout', () => {
        clearTimeout(timeout)
        req.destroy()
        resolve({ success: false, latencyMs: TEST_TIMEOUT })
      })
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
