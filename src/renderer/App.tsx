// ============================================================================
// App.tsx — Корневой компонент приложения
// ============================================================================
// Управляет глобальным состоянием, IPC-подписками и оркестрирует UI.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import TitleBar from './components/TitleBar'
import MainScreen from './components/MainScreen'
import SettingsPanel from './components/SettingsPanel'
import UpdateBanner, { AppUpdateState } from './components/UpdateBanner'
import { Settings, RefreshCw } from 'lucide-react'

type Status = 'disconnected' | 'analyzing' | 'connecting' | 'connected' | 'error'

interface LogEntry {
  timestamp: number
  level: string
  message: string
}

interface Strategy {
  id: string
  name: string
  description: string
  category: string
}

interface DomainResult {
  name: string
  success: boolean
  latencyMs: number
}

interface SmartStartProgress {
  current: number
  total: number
  strategyName: string
  domainResults?: DomainResult[]
}

const App: React.FC = () => {
  // ─── State ────────────────────────────────────────────────
  const [status, setStatus] = useState<Status>('disconnected')
  const [strategyName, setStrategyName] = useState<string | null>(null)
  const [currentStrategyId, setCurrentStrategyId] = useState<string | null>(null)
  const [uptime, setUptime] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [smartStartProgress, setSmartStartProgress] = useState<SmartStartProgress | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'updating' | 'done' | 'error'>('idle')
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState | null>(null)
  const [appUpdateDismissed, setAppUpdateDismissed] = useState(false)

  const uptimeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  // Флаг: идёт ли Smart Start (чтобы не показывать промежуточные ошибки)
  const isSmartStartRunningRef = useRef<boolean>(false)

  // ─── Загрузка начальных данных ──────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const strats = await window.api?.getStrategies?.()
        if (strats) setStrategies(strats)

        const config = await window.api?.getConfig?.()
        if (config?.lastStrategyId) {
          setCurrentStrategyId(config.lastStrategyId)
        }

        const state = await window.api?.getEngineState?.()
        if (state) {
          setStatus(state.status as Status)
          if (state.currentStrategy) {
            setStrategyName(state.currentStrategy.name)
            setCurrentStrategyId(state.currentStrategy.id)
          }
          if (state.logs) setLogs(state.logs)
        }
      } catch (e) {
        console.warn('IPC not available (dev mode?):', e)
      }
    }

    init()
  }, [])

  // ─── IPC Event подписки ──────────────────────────────────
  useEffect(() => {
    const unsubStatus = window.api?.onStatusChange?.((newStatus: string) => {
      if (isSmartStartRunningRef.current) {
        // Игнорируем ВСЕ статусы (включая connected) во время анализа.
        // Переход в 'connected' мы вручную дернем, когда весь цикл завершится.
        return
      }

      setStatus(newStatus as Status)

      if (newStatus === 'connected') {
        setErrorMessage(null)
        startTimeRef.current = Date.now()
        uptimeIntervalRef.current = setInterval(() => {
          setUptime(Date.now() - startTimeRef.current)
        }, 1000)
      } else if (newStatus === 'disconnected') {
        setErrorMessage(null)
        if (uptimeIntervalRef.current) {
          clearInterval(uptimeIntervalRef.current)
          uptimeIntervalRef.current = null
        }
      } else if (newStatus === 'error') {
        if (uptimeIntervalRef.current) {
          clearInterval(uptimeIntervalRef.current)
          uptimeIntervalRef.current = null
        }
        setUptime(0)
        setSmartStartProgress(null)
      }
    })

    const unsubLog = window.api?.onLog?.((entry: LogEntry) => {
      setLogs(prev => [...prev.slice(-499), entry])

      // Автоматически распознаём ошибки и показываем на главном экране
      if (entry.level === 'error' && entry.message && !isSmartStartRunningRef.current) {
        const msg = entry.message
        if (msg.includes('администратора') || msg.includes('EACCES') || msg.includes('EPERM')) {
          setErrorMessage('Требуются права администратора. Запустите приложение от имени администратора (Run as Administrator).')
        } else if (msg.includes('не найден') || msg.includes('not found')) {
          setErrorMessage('Бинарные файлы zapret не найдены. Нажмите «Обновить» для скачивания.')
        } else if (msg.includes('перезапуск')) {
          setErrorMessage('Стратегия завершилась. Попробуйте выбрать другой профиль в настройках.')
        } else if (!errorMessage) {
          setErrorMessage(`Ошибка: ${msg.substring(0, 100)}`)
        }
      }
    })

    const unsubProgress = window.api?.onSmartStartProgress?.((data: any) => {
      setSmartStartProgress({
        current: data.current,
        total: data.total,
        strategyName: data.strategyName,
        domainResults: data.domainResults
      })
    })

    // Подписка на состояние автообновления приложения
    const unsubAppUpdate = (window as any).api?.onAppUpdateStateChange?.((state: AppUpdateState) => {
      setAppUpdateState(state)
      // Если пришло новое обновление — показываем баннер
      if (state.status === 'available' || state.status === 'downloading' ||
          state.status === 'downloaded' || state.status === 'error') {
        setAppUpdateDismissed(false)
      }
    })

    // Получаем начальное состояние обновления
    ;(window as any).api?.getAppUpdateState?.().then((state: AppUpdateState) => {
      if (state) setAppUpdateState(state)
    }).catch(() => {})

    return () => {
      unsubStatus?.()
      unsubLog?.()
      unsubProgress?.()
      unsubAppUpdate?.()
      if (uptimeIntervalRef.current) clearInterval(uptimeIntervalRef.current)
    }
  }, [])

  // ─── Обработчик кнопки Power ─────────────────────────────
  const handleToggle = useCallback(async () => {
    try {
      if (status === 'connected' || status === 'analyzing') {
        // Остановка
        isSmartStartRunningRef.current = false
        if (status === 'analyzing') {
          await window.api?.abortSmartStart?.()
        }
        await window.api?.stopEngine?.()
        setStatus('disconnected')
        setStrategyName(null)
        setSmartStartProgress(null)
        setErrorMessage(null)
      } else {
        // Проверяем наличие бинарников, если нет — качаем автоматически
        const binInstalled = await window.api?.areBinariesInstalled?.()
        if (binInstalled === false) {
          setStatus('analyzing')
          setSmartStartProgress({
            current: 0,
            total: 1,
            strategyName: 'Скачивание бинарников zapret...'
          })
          try {
            await window.api?.performUpdate?.()
          } catch (err) {
            console.error('Update failed:', err)
            setStatus('error')
            setSmartStartProgress(null)
            return
          }
        }

        // Запуск
        if (currentStrategyId && currentStrategyId !== 'auto' && currentStrategyId !== 'auto-deep') {
          // Есть выбранная стратегия — запускаем напрямую
          setStatus('connecting')
          await window.api?.startEngine?.(currentStrategyId)

          const strat = strategies.find(s => s.id === currentStrategyId)
          setStrategyName(strat?.name || currentStrategyId)
        } else {
          // Smart Start — автоподбор
          setStatus('analyzing')
          isSmartStartRunningRef.current = true

          const isDeep = currentStrategyId === 'auto-deep'
          const result = await window.api?.runSmartStart?.(isDeep)

          isSmartStartRunningRef.current = false
          setSmartStartProgress(null) // <--- Очищаем прогресс

          if (result?.success && result.strategy) {
            const isFallback = (result as any).isFallback === true
            // Префикс "Резерв:" даёт визуальный сигнал, что стратегия выбрана
            // как запасная (автоподбор не смог определить оптимальную)
            const prefix = isFallback ? 'Резерв: ' : (isDeep ? 'Глубокий: ' : 'Авто: ')
            setStrategyName(prefix + result.strategy.name)

            // Запускаем таймер аптайма и устанавливаем статус подключено,
            // потому что в onStatusChange мы игнорировали эвенты во время SmartStart
            setStatus('connected')
            setErrorMessage(null)
            startTimeRef.current = Date.now()
            if (uptimeIntervalRef.current) clearInterval(uptimeIntervalRef.current)
            uptimeIntervalRef.current = setInterval(() => {
              setUptime(Date.now() - startTimeRef.current)
            }, 1000)
          } else {
            setStatus('error')
            setErrorMessage(result?.error || 'Ни одна стратегия не сработала. Попробуйте выбрать стратегию вручную в настройках.')
          }
        }
      }
    } catch (err) {
      console.error('Toggle error:', err)
      isSmartStartRunningRef.current = false
      setErrorMessage(`Не удалось запустить: ${(err as Error)?.message || 'неизвестная ошибка'}`)
      setStatus('error')
    }
  }, [status, currentStrategyId, strategies])

  // ─── Выбор стратегии в настройках ────────────────────────
  const handleStrategyChange = useCallback(async (id: string) => {
    setCurrentStrategyId(id)
    try {
      await window.api?.setStrategy?.(id)
    } catch { /* ignore in dev */ }
  }, [])

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="app-container">
      <TitleBar />

      {/* Баннер обновления приложения */}
      <UpdateBanner
        state={appUpdateDismissed ? null : appUpdateState}
        onDownload={() => (window as any).api?.downloadAppUpdate?.()}
        onInstall={() => (window as any).api?.installAppUpdate?.()}
        onDismiss={() => setAppUpdateDismissed(true)}
      />


      <MainScreen
        status={status}
        strategyName={strategyName}
        uptime={uptime}
        errorMessage={errorMessage}
        onToggle={handleToggle}
        smartStartProgress={smartStartProgress}
      />

      <div className="bottom-bar">
        <button
          className="bottom-bar__btn"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={14} /> Настройки
        </button>
        <button
          className="bottom-bar__btn bottom-bar__btn--update"
          disabled={updateStatus === 'checking' || updateStatus === 'updating'}
          onClick={async () => {
            try {
              setUpdateStatus('checking')
              const info = await window.api?.checkUpdate?.()
              if (info?.available) {
                setUpdateStatus('updating')
                await window.api?.performUpdate?.()
                setUpdateStatus('done')
                setTimeout(() => setUpdateStatus('idle'), 3000)
              } else {
                setUpdateStatus('done')
                setTimeout(() => setUpdateStatus('idle'), 2000)
              }
            } catch {
              setUpdateStatus('error')
              setTimeout(() => setUpdateStatus('idle'), 3000)
            }
          }}
        >
          <RefreshCw size={14} className={updateStatus === 'checking' || updateStatus === 'updating' ? 'spin' : ''} />
          {updateStatus === 'checking' ? 'Проверка...' :
           updateStatus === 'updating' ? 'Обновление...' :
           updateStatus === 'done' ? 'Готово' :
           updateStatus === 'error' ? 'Ошибка' : 'Обновить'}
        </button>
      </div>

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        strategies={strategies}
        currentStrategyId={currentStrategyId}
        onStrategyChange={handleStrategyChange}
        logs={logs}
        appUpdateState={appUpdateState}
        onCheckAppUpdate={() => {
          setAppUpdateDismissed(false)
          ;(window as any).api?.checkAppUpdate?.()
        }}
        onDownloadAppUpdate={() => (window as any).api?.downloadAppUpdate?.()}
        onInstallAppUpdate={() => (window as any).api?.installAppUpdate?.()}
      />
    </div>
  )
}

export default App
