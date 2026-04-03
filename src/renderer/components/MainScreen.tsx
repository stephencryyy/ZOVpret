// ============================================================================
// MainScreen — Главный экран приложения
// ============================================================================
// Собирает PowerButton, StatusIndicator и Info-карточки в единый layout.
// ============================================================================

import React from 'react'
import PowerButton from './PowerButton'
import StatusIndicator from './StatusIndicator'

type Status = 'disconnected' | 'analyzing' | 'connecting' | 'connected' | 'error'

interface MainScreenProps {
  status: Status
  strategyName: string | null
  uptime: number
  onToggle: () => void
  smartStartProgress?: {
    current: number
    total: number
    strategyName: string
  } | null
}

/** Форматировать аптайм из мс в HH:MM:SS */
function formatUptime(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const totalSecs = Math.floor(ms / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  return [h, m, s].map(n => n.toString().padStart(2, '0')).join(':')
}

const MainScreen: React.FC<MainScreenProps> = ({
  status,
  strategyName,
  uptime,
  onToggle,
  smartStartProgress
}) => {
  const isDisabled = status === 'connecting'

  return (
    <div className="main-content">
      {/* Статус */}
      <StatusIndicator
        status={status}
        strategyName={strategyName}
        smartStartProgress={smartStartProgress}
      />

      {/* Центральная кнопка */}
      <PowerButton
        status={status}
        onClick={onToggle}
        disabled={isDisabled}
      />

      {/* Информационные карточки */}
      <div className="info-cards fade-in">
        <div className="info-card">
          <div className="info-card__label">Аптайм</div>
          <div className="info-card__value">
            {status === 'connected' ? formatUptime(uptime) : '—'}
          </div>
        </div>
        <div className="info-card">
          <div className="info-card__label">Стратегия</div>
          <div className="info-card__value" style={{ fontSize: '12px' }}>
            {strategyName || 'Авто'}
          </div>
        </div>
        <div className="info-card">
          <div className="info-card__label">Режим</div>
          <div className="info-card__value" style={{ fontSize: '12px' }}>
            Hostlist
          </div>
        </div>
      </div>
    </div>
  )
}

export default MainScreen
