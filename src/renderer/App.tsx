// ============================================================================
// App.tsx — Корневой компонент приложения
// ============================================================================
// Управляет глобальным состоянием, IPC-подписками и оркестрирует UI.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import TitleBar from './components/TitleBar'
import MainScreen from './components/MainScreen'
import SettingsPanel from './components/SettingsPanel'
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

interface SmartStartProgress {
  current: number
  total: number
  strategyName: string
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

  const uptimeIntervalRef = useRef<NodeJS.Timeout | null>(null)
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
      // Во время Smart Start — игнорируем промежуточные error/disconnected
      // (каждая неудачная стратегия эмитит error, но это нормально)
      if (isSmartStartRunningRef.current) {
        if (newStatus === 'connected') {
          setStatus('connected')
          setErrorMessage(null)
          startTimeRef.current = Date.now()
          uptimeIntervalRef.current = setInterval(() => {
            setUptime(Date.now() - startTimeRef.current)
          }, 1000)
        }
        // error/disconnected/connecting — игнорируем, оставляем 'analyzing'
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
      if (entry.level === 'error' && entry.message) {
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
        strategyName: data.strategyName
      })
    })

    return () => {
      unsubStatus?.()
      unsubLog?.()
      unsubProgress?.()
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
        if (currentStrategyId) {
          // Есть выбранная стратегия — запускаем напрямую
          setStatus('connecting')
          await window.api?.startEngine?.(currentStrategyId)

          const strat = strategies.find(s => s.id === currentStrategyId)
          setStrategyName(strat?.name || currentStrategyId)
        } else {
          // Smart Start — автоподбор
          setStatus('analyzing')
          isSmartStartRunningRef.current = true

          const result = await window.api?.runSmartStart?.()

          isSmartStartRunningRef.current = false

          if (result?.success && result.strategy) {
            setStrategyName(result.strategy.name)
            setCurrentStrategyId(result.strategy.id)
            // status уже 'connected' от IPC event
          } else {
            setStatus('error')
            setSmartStartProgress(null)
            setErrorMessage('Ни одна стратегия не сработала. Попробуйте выбрать стратегию вручную в настройках.')
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
          onClick={async () => {
            try {
              const info = await window.api?.checkUpdate?.()
              if (info?.available) {
                await window.api?.performUpdate?.()
              }
            } catch { /* ignore */ }
          }}
        >
          <RefreshCw size={14} /> Обновить
        </button>
      </div>

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        strategies={strategies}
        currentStrategyId={currentStrategyId}
        onStrategyChange={handleStrategyChange}
        logs={logs}
      />
    </div>
  )
}

export default App
