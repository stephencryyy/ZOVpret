// ============================================================================
// MainScreen — Главный экран приложения
// ============================================================================

import React from 'react'
import { motion } from 'framer-motion'
import PowerButton from './PowerButton'
import StatusIndicator from './StatusIndicator'
import TgProxyWidget from './TgProxyWidget'

type Status = 'disconnected' | 'analyzing' | 'connecting' | 'connected' | 'error'

interface MainScreenProps {
  status: Status
  strategyName: string | null
  uptime: number
  errorMessage?: string | null
  onToggle: () => void
  smartStartProgress?: {
    current: number
    total: number
    strategyName: string
  } | null
}

function formatUptime(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const totalSecs = Math.floor(ms / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  return [h, m, s].map(n => n.toString().padStart(2, '0')).join(':')
}

// Framer Motion variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
}

const MainScreen: React.FC<MainScreenProps> = ({
  status,
  strategyName,
  uptime,
  errorMessage,
  onToggle,
  smartStartProgress
}) => {
  const isDisabled = status === 'connecting'

  return (
    <motion.div
      className="main-content"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <StatusIndicator
        status={status}
        strategyName={strategyName}
        errorMessage={errorMessage}
        smartStartProgress={smartStartProgress}
      />

      <motion.div variants={itemVariants}>
        <PowerButton
          status={status}
          onClick={onToggle}
          disabled={isDisabled}
        />
      </motion.div>

      <motion.div className="info-cards" variants={containerVariants}>
        <motion.div className="info-card" variants={itemVariants}>
          <div className="info-card__label">Аптайм</div>
          <div className="info-card__value">
            {status === 'connected' ? formatUptime(uptime) : '—'}
          </div>
        </motion.div>
        
        <motion.div className="info-card" variants={itemVariants}>
          <div className="info-card__label">Стратегия</div>
          <div className="info-card__value" style={{ fontSize: '12px' }}>
            {strategyName || 'Авто'}
          </div>
        </motion.div>
        
        <motion.div className="info-card" variants={itemVariants}>
          <div className="info-card__label">Режим</div>
          <div className="info-card__value" style={{ fontSize: '12px' }}>
            Hostlist
          </div>
        </motion.div>
      </motion.div>

      <motion.div variants={itemVariants} style={{ width: '100%', maxWidth: '280px', margin: '0 auto' }}>
        <TgProxyWidget />
      </motion.div>
    </motion.div>
  )
}

export default MainScreen
