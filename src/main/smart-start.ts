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

/** Тестовые домены для проверки. Если один недоступен, пробуем следующий. */
const TEST_URLS = [
  { hostname: 'www.youtube.com', path: '/', name: 'YouTube' },
  { hostname: 'x.com', path: '/', name: 'X (Twitter)' },
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
   * Перебирает все стратегии из пула и тестирует каждую.
   */
  async run(): Promise<SmartStartResult> {
    this.aborted = false
    const total = STRATEGIES.length

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

        // 4. Тестировать HTTPS-запрос к тестовому домену
        const result = await this.testConnection()

        if (result.success) {
          // 5. Стратегия работает!
          this.emit('progress', {
            current: i + 1,
            total,
            strategyName: strategy.name,
            status: 'success'
          })

          // Сохраняем рабочую стратегию
          setConfig({ lastStrategyId: strategy.id })

          return {
            success: true,
            strategy,
            latencyMs: result.latencyMs
          }
        }

        // Стратегия не сработала — останавливаем и пробуем следующую
        await this.engine.stop()

      } catch (err: any) {
        // Ошибка при тесте — продолжаем со следующей
        this.emit('progress', {
          current: i + 1,
          total,
          strategyName: strategy.name,
          status: 'failed'
        })
        try { await this.engine.stop() } catch { /* ignore */ }
      }
    }

    // Ни одна стратегия не сработала
    return {
      success: false,
      strategy: null,
      latencyMs: 0,
      error: 'Ни одна из стратегий не сработала. Попробуйте позже или настройте вручную.'
    }
  }

  /** Отменить подбор */
  abort(): void {
    this.aborted = true
    this.engine.stop().catch(() => {})
  }

  /**
   * Тестирование соединения: пробуем GET-запрос к тестовым доменам.
   * Возвращаем успех, если хотя бы один домен ответил 200/301/302.
   */
  private async testConnection(): Promise<{ success: boolean; latencyMs: number }> {
    for (const testUrl of TEST_URLS) {
      try {
        const result = await this.httpsGet(testUrl.hostname, testUrl.path)
        if (result.success) {
          return result
        }
      } catch {
        continue
      }
    }
    return { success: false, latencyMs: 0 }
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
