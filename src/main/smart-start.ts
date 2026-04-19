// ============================================================================
// ZOVpret — Smart Start (Автоматический подбор стратегии)
// ============================================================================
// Последовательно тестирует стратегии из пула, делая HTTPS-запросы к тестовым
// доменам через запущенный winws.exe. Ищет стратегию с максимальным покрытием
// заблокированных сервисов (YouTube, Discord, Telegram, Instagram, X).
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

/** Таймаут на тест одной стратегии — быстрый авто-режим (мс).
 *  6000 выбрано как компромисс: достаточно для fake-packet retries + TLS handshake,
 *  но не слишком долго чтобы цикл из 20 стратегий укладывался в разумное время. */
const TEST_TIMEOUT_FAST = 6000

/** Таймаут для baseline-проверки (без winws) — короче, т.к. сеть чистая */
const BASELINE_TIMEOUT = 5000

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
   * Auto (быстрый): ищет первую стратегию, разблокирующую ВСЕ заблокированные на
   *   baseline домены. Если идеальной нет — берёт лучшую по relevantScore.
   *   Таймаут 6сек, уменьшенные задержки.
   *
   * Deep (глубокий): тестирует все 20 стратегий, выбирает лучшую по
   *   relevantScore + средней задержке. Таймаут 8сек, полные задержки.
   */
  async run(deepAnalysis: boolean = false): Promise<SmartStartResult> {
    this.aborted = false
    const total = STRATEGIES.length
    const testTimeout = deepAnalysis ? TEST_TIMEOUT_DEEP : TEST_TIMEOUT_FAST

    // ─── Baseline: проверяем какие домены заблокированы БЕЗ winws ────
    // Важно: движок может быть уже запущен (например, предыдущая стратегия).
    // Останавливаем его перед baseline, чтобы получить чистую картину.
    try {
      await this.engine.stop()
      await this.delay(500)
    } catch { /* ignore */ }

    this.emit('progress', {
      current: 0,
      total,
      strategyName: 'Проверка доступности...',
      status: 'baseline'
    } as SmartStartProgress)

    const baseline = await this.testConnection(BASELINE_TIMEOUT)
    // Индексы доменов, которые ЗАБЛОКИРОВАНЫ на baseline (не открылись без winws)
    const blockedIdx: number[] = baseline.domainResults
      .map((r, i) => r.success ? -1 : i)
      .filter(i => i !== -1)

    // Если все домены доступны без обхода — нечего обходить
    if (blockedIdx.length === 0) {
      return {
        success: false,
        strategy: null,
        latencyMs: 0,
        score: 0,
        domainResults: baseline.domainResults,
        error: 'Все домены уже доступны без обхода DPI. Обход не требуется.'
      }
    }

    const blockedCount = blockedIdx.length
    this.emit('progress', {
      current: 0,
      total,
      strategyName: `Заблокировано ${blockedCount} из ${TEST_URLS.length} доменов`,
      status: 'baseline',
      domainResults: baseline.domainResults
    } as SmartStartProgress)

    // ─── Перебор стратегий ──────────────────────────────────────────
    // Оценки: relevantScore = сколько из ЗАБЛОКИРОВАННЫХ на baseline
    //   доменов стратегия смогла разблокировать.
    //   totalScore = сколько всего доменов работает через стратегию
    //   (включая те, которые работали и без winws).
    let bestStrategy: Strategy | null = null
    let bestRelevantScore = -1
    let bestTotalScore = -1
    let bestLatency = Infinity
    let bestDomainResults: DomainResult[] = []

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
        const { avgLatency, domainResults } = await this.testConnection(testTimeout)

        // Считаем relevantScore (только из заблокированных на baseline)
        const relevantScore = blockedIdx.filter(idx => domainResults[idx].success).length
        const totalScore = domainResults.filter(d => d.success).length

        // Обновляем лучшую стратегию, если она даёт больше покрытия
        const isBetter =
          relevantScore > bestRelevantScore ||
          (relevantScore === bestRelevantScore && totalScore > bestTotalScore) ||
          (relevantScore === bestRelevantScore && totalScore === bestTotalScore && avgLatency < bestLatency)

        if (isBetter && (relevantScore > 0 || totalScore > 0)) {
          bestRelevantScore = relevantScore
          bestTotalScore = totalScore
          bestLatency = avgLatency
          bestStrategy = strategy
          bestDomainResults = domainResults
        }

        // Fast-track: в авто-режиме — если стратегия разблокировала ВСЕ
        // заблокированные домены, берём её сразу без дальнейшего перебора.
        if (!deepAnalysis && relevantScore >= blockedCount) {
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
            score: totalScore,
            domainResults
          }
        }

        // Стратегия не идеальна (или идёт глубокий анализ) — останавливаем
        await this.engine.stop()
        await this.delay(500) // Ждём освобождения WinDivert

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
          await this.delay(500)
        } catch { /* ignore */ }
      }
    }

    // ─── Итог: выбираем лучшее из найденного ─────────────────────────
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
      } catch { /* ignore */ }
      return {
        success: true,
        strategy: bestStrategy,
        latencyMs: bestLatency,
        score: bestTotalScore,
        domainResults: bestDomainResults
      }
    }

    // ─── Fallback: ничего не разблокировалось ────────────────────────
    // Возможные причины: слишком строгая DPI, нестабильная сеть, все тесты
    // истекли по таймауту. Запускаем первую стратегию (General) как дефолт,
    // чтобы пользователь мог хоть что-то попробовать вручную.
    const fallback = STRATEGIES[0]
    try {
      await this.engine.start(fallback)
      setConfig({ lastStrategyId: fallback.id })
      const notWorkingNames = blockedIdx.map(i => TEST_URLS[i].name).join(', ')
      return {
        success: false,
        strategy: fallback,
        latencyMs: 0,
        score: 0,
        domainResults: baseline.domainResults,
        error: `Ни одна стратегия не разблокировала: ${notWorkingNames}. Активирована ${fallback.name} — попробуйте выбрать другую стратегию вручную в настройках.`
      }
    } catch {
      return {
        success: false,
        strategy: null,
        latencyMs: 0,
        score: 0,
        domainResults: baseline.domainResults,
        error: 'Ни одна из стратегий не сработала. Проверьте подключение к интернету или выберите стратегию вручную.'
      }
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
      let req: ReturnType<typeof https.get> | null = null
      const timer = setTimeout(() => {
        try { req?.destroy() } catch { /* ignore */ }
        resolve({ success: false, latencyMs: timeout })
      }, timeout)

      req = https.get(
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
