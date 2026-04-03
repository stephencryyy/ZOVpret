// ============================================================================
// StatusIndicator — Отображение текущего статуса подключения
// ============================================================================

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Activity, Zap, CheckCircle2 } from 'lucide-react'

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
  analyzing: 'Анализ пакетов...',
  connecting: 'Подключение...',
  connected: 'Подключено',
  error: 'Ошибка соединения'
}

const getStatusIcon = (status: Status) => {
  switch (status) {
    case 'error': return <AlertTriangle size={14} />
    case 'analyzing': return <Activity size={14} className="animate-pulse" />
    case 'connecting': return <Zap size={14} />
    case 'connected': return <CheckCircle2 size={14} />
    default: return null
  }
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  strategyName,
  errorMessage,
  smartStartProgress
}) => {
  return (
    <div className="status-area">
      <div className="status-label">Статус сети</div>
      
      <AnimatePresence mode="popLayout">
        <motion.div
          key={status}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className={`status-text status-text--${status}`}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
        >
          {getStatusIcon(status)}
          {STATUS_LABELS[status]}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {/* Понятное сообщение об ошибке с Lucide Icon */}
        {status === 'error' && errorMessage && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, height: 0 }}
            animate={{ opacity: 1, scale: 1, height: 'auto' }}
            exit={{ opacity: 0, scale: 0.95, height: 0 }}
            className="error-card"
            style={{
              marginTop: '12px',
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '12px',
              fontSize: '11px',
              color: '#fca5a5',
              lineHeight: 1.6,
              textAlign: 'left',
              maxWidth: '320px',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start'
            }}
          >
            <div style={{ color: '#ef4444', marginTop: '2px' }}>
              <AlertTriangle size={16} />
            </div>
            <div>{errorMessage}</div>
          </motion.div>
        )}

        {/* Бейдж стратегии при подключении */}
        {status === 'connected' && strategyName && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="strategy-badge"
          >
            <span className="strategy-badge__dot" />
            Профиль: {strategyName}
          </motion.div>
        )}

        {/* Прогресс Smart Start */}
        {status === 'analyzing' && smartStartProgress && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="smart-start-info"
          >
            <div className="smart-start-info__strategy">
              Тест: {smartStartProgress.strategyName}
            </div>
            <div className="smart-start-info__progress">
              Этап {smartStartProgress.current} из {smartStartProgress.total}
            </div>
            <div className="progress-bar-container">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${(smartStartProgress.current / smartStartProgress.total) * 100}%`
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default StatusIndicator
