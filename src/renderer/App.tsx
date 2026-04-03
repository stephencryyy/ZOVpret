// ============================================================================
// App.tsx — Корневой компонент приложения
// ============================================================================
// Управляет глобальным состоянием, IPC-подписками и оркестрирует UI.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import TitleBar from './components/TitleBar'
import MainScreen from './components/MainScreen'
import SettingsPanel from './components/SettingsPanel'

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

  const uptimeIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  // ─── Загрузка начальных данных ──────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        // Загружаем список стратегий
        const strats = await window.api?.getStrategies?.()
        if (strats) setStrategies(strats)

        // Загружаем конфиг
        const config = await window.api?.getConfig?.()
        if (config?.lastStrategyId) {
          setCurrentStrategyId(config.lastStrategyId)
        }

        // Проверяем начальное состояние движка
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
        // API может быть недоступен в dev-режиме без Electron
        console.warn('IPC not available (dev mode?):', e)
      }
    }

    init()
  }, [])

  // ─── IPC Event подписки ──────────────────────────────────
  useEffect(() => {
    const unsubStatus = window.api?.onStatusChange?.((newStatus: string) => {
      setStatus(newStatus as Status)

      if (newStatus === 'connected') {
        startTimeRef.current = Date.now()
        uptimeIntervalRef.current = setInterval(() => {
          setUptime(Date.now() - startTimeRef.current)
        }, 1000)
      } else if (newStatus === 'disconnected' || newStatus === 'error') {
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
        if (status === 'analyzing') {
          await window.api?.abortSmartStart?.()
        }
        await window.api?.stopEngine?.()
        setStatus('disconnected')
        setStrategyName(null)
        setSmartStartProgress(null)
      } else {
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
          const result = await window.api?.runSmartStart?.()

          if (result?.success && result.strategy) {
            setStrategyName(result.strategy.name)
            setCurrentStrategyId(result.strategy.id)
          } else {
            setStatus('error')
            setSmartStartProgress(null)
          }
        }
      }
    } catch (err) {
      console.error('Toggle error:', err)
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
      <TitleBar onSettingsClick={() => setSettingsOpen(true)} />

      <MainScreen
        status={status}
        strategyName={strategyName}
        uptime={uptime}
        onToggle={handleToggle}
        smartStartProgress={smartStartProgress}
      />

      <div className="bottom-bar">
        <button
          className="bottom-bar__btn"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙ Настройки
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
          ↻ Обновить
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
