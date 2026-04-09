// ============================================================================
// ZOVpret — Smart Start (Автоматический подбор стратегии)
// ============================================================================
// Последовательно тестирует стратегии из пула, делая HTTPS-запросы к тестовым
// доменам через запущенный winws.exe. Ищет стратегию с максимальным покрытием
// всех целевых сервисов (YouTube, Discord, Telegram, Instagram, X).
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
  { hostname: 'www.instagram.com', path: '/', name: 'Instagram' },
  { hostname: 'x.com', path: '/', name: 'X (Twitter)' }
]

/** Таймаут на тест одной стратегии — глубокий анализ (мс) */
const TEST_TIMEOUT_DEEP = 8000

/** Таймаут на тест одной стратегии — быстрый авто-режим (мс) */
const TEST_TIMEOUT_FAST = 4000

/** Задержка после первого запуска winws (мс) — WinDivert загружается в ядро */
const START_DELAY_FIRST = 2500

/** Задержка для последующих стратегий (мс) — WinDivert уже в памяти */
const START_DELAY_NEXT = 1500

export interface DomainResult {
  name: string
  success: boolean
  latencyMs: number
}

export interface SmartStartProgress {
  current: number
  total: number
  strategyName: string
  status: 'testing' | 'success' | 'failed' | 'baseline'
  domainResults?: DomainResult[]
}

export interface SmartStartResult {
  success: boolean
  strategy: Strategy | null
  latencyMs: number
  score: number
  domainResults?: DomainResult[]
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
   *
   * Auto (быстрый): ищет первую стратегию, покрывающую ВСЕ заблокированные домены.
   *   Если идеальной нет — берёт лучшую по score. Таймаут 4сек, уменьшенные задержки.
   *
   * Deep (глубокий): тестирует все стратегии, выбирает лучшую по score + latency.
   *   Таймаут 8сек, полные задержки.
   */
  async run(deepAnalysis: boolean = false): Promise<SmartStartResult> {
    this.aborted = false
    const total = STRATEGIES.length
    const testTimeout = deepAnalysis ? TEST_TIMEOUT_DEEP : TEST_TIMEOUT_FAST

    let bestStrategy: Strategy | null = null
    let bestScore = -1
    let bestLatency = Infinity
    let bestDomainResults: DomainResult[] = []

    // ─── Baseline: проверяем какие домены заблокированы БЕЗ winws ────
    this.emit('progress', {
      current: 0,
      total,
      strategyName: 'Проверка доступности...',
      status: 'baseline'
    } as SmartStartProgress)

    const baseline = await this.testConnection(TEST_TIMEOUT_FAST)
    const blockedUrls = TEST_URLS.filter(
      (_, i) => !baseline.domainResults[i].success
    )

    // Если все домены доступны без обхода — нечего обходить
    if (blockedUrls.length === 0) {
      return {
        success: false,
        strategy: null,
        latencyMs: 0,
        score: 0,
        domainResults: baseline.domainResults,
        error: 'Все домены уже доступны без обхода DPI. Обход не требуется.'
      }
    }

    const maxScore = blockedUrls.length
    this.emit('progress', {
      current: 0,
      total,
      strategyName: `Заблокировано ${maxScore} из ${TEST_URLS.length} доменов`,
      status: 'baseline',
      domainResults: baseline.domainResults
    } as SmartStartProgress)

    // ─── Перебор стратегий ──────────────────────────────────────────
    for (let i = 0; i < STRATEGIES.length; i++) {
      if (this.aborted) break

      const strategy = STRATEGIES[i]
      const startDelay = i === 0 ? START_DELAY_FIRST : START_DELAY_NEXT

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
        await this.delay(startDelay)

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
        const { score, avgLatency, domainResults } = await this.testConnection(testTimeout)

        if (score > 0) {
          // Стратегия работает хотя бы для одного сайта
          if (score > bestScore || (score === bestScore && avgLatency < bestLatency)) {
            bestScore = score
            bestLatency = avgLatency
            bestStrategy = strategy
            bestDomainResults = domainResults
          }

          // Fast-track: если не нужен глубокий анализ и найдена идеальная стратегия
          // (покрывает ВСЕ домены), останавливаемся сразу.
          if (!deepAnalysis && score >= TEST_URLS.length) {
            this.emit('progress', {
              current: i + 1,
              total,
              strategyName: strategy.name,
              status: 'success',
              domainResults
            })
            setConfig({ lastStrategyId: strategy.id })
            return {
              success: true,
              strategy,
              latencyMs: avgLatency,
              score,
              domainResults
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
        status: 'success',
        domainResults: bestDomainResults
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
        score: bestScore,
        domainResults: bestDomainResults
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
   * Возвращает количество успешных ответов (score), средний пинг и результаты по каждому домену.
   */
  private async testConnection(timeout: number): Promise<{
    score: number
    avgLatency: number
    domainResults: DomainResult[]
  }> {
    const promises = TEST_URLS.map(u => this.httpsGet(u.hostname, u.path, timeout))
    const results = await Promise.all(promises)

    const domainResults: DomainResult[] = TEST_URLS.map((u, i) => ({
      name: u.name,
      success: results[i].success,
      latencyMs: results[i].latencyMs
    }))

    const successful = results.filter(r => r.success)
    const score = successful.length

    let avgLatency = Infinity
    if (score > 0) {
      const totalPing = successful.reduce((acc, curr) => acc + curr.latencyMs, 0)
      avgLatency = Math.round(totalPing / score)
    }

    return { score, avgLatency, domainResults }
  }

  /** Выполнить HTTPS GET-запрос */
  private httpsGet(
    hostname: string,
    path: string,
    timeout: number
  ): Promise<{ success: boolean; latencyMs: number }> {
    return new Promise((resolve) => {
      const start = Date.now()
      const timer = setTimeout(() => {
        resolve({ success: false, latencyMs: timeout })
      }, timeout)

      const req = https.get(
        {
          hostname,
          path,
          port: 443,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
          },
          timeout
        },
        (res) => {
          clearTimeout(timer)
          const latencyMs = Date.now() - start
          const statusCode = res.statusCode || 0
          // 200, 301, 302 — считаем успехом (сервер ответил)
          const success = statusCode >= 200 && statusCode < 400
          res.destroy()
          resolve({ success, latencyMs })
        }
      )

      req.on('error', () => {
        clearTimeout(timer)
        resolve({ success: false, latencyMs: Date.now() - start })
      })

      req.on('timeout', () => {
        clearTimeout(timer)
        req.destroy()
        resolve({ success: false, latencyMs: timeout })
      })
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
