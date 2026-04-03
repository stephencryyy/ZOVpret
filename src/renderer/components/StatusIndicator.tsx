// ============================================================================
// StatusIndicator — Отображение текущего статуса подключения
// ============================================================================

import React from 'react'

type Status = 'disconnected' | 'analyzing' | 'connecting' | 'connected' | 'error'

interface StatusIndicatorProps {
  status: Status
  strategyName: string | null
  errorMessage?: string | null
  smartStartProgress?: {
    current: number
    total: number
    strategyName: string
  } | null
}

const STATUS_LABELS: Record<Status, string> = {
  disconnected: 'Отключено',
  analyzing: 'Анализ DPI...',
  connecting: 'Подключение...',
  connected: 'Подключено',
  error: 'Ошибка'
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  strategyName,
  errorMessage,
  smartStartProgress
}) => {
  return (
    <div className="status-area fade-in">
      <div className="status-label">Статус</div>
      <div className={`status-text status-text--${status}`}>
        {STATUS_LABELS[status]}
      </div>

      {/* Понятное сообщение об ошибке */}
      {status === 'error' && errorMessage && (
        <div style={{
          marginTop: '8px',
          padding: '10px 16px',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#fca5a5',
          lineHeight: 1.5,
          textAlign: 'center',
          maxWidth: '320px'
        }}>
          {errorMessage}
        </div>
      )}

      {/* Бейдж стратегии при подключении */}
      {status === 'connected' && strategyName && (
        <div className="strategy-badge">
          <span className="strategy-badge__dot" />
          Стратегия: {strategyName}
        </div>
      )}

      {/* Прогресс Smart Start */}
      {status === 'analyzing' && smartStartProgress && (
        <div className="smart-start-info">
          <div className="smart-start-info__strategy">
            Тестирование: {smartStartProgress.strategyName}
          </div>
          <div className="smart-start-info__progress">
            {smartStartProgress.current} / {smartStartProgress.total}
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{
                width: `${(smartStartProgress.current / smartStartProgress.total) * 100}%`
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default StatusIndicator
