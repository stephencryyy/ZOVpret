// ============================================================================
// MainScreen — Главный экран приложения
// ============================================================================

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Wifi } from 'lucide-react'
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

interface DomainTestResult {
  name: string
  success: boolean
  latencyMs: number
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
  const [testResults, setTestResults] = useState<DomainTestResult[] | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResults(null)
    try {
      const results = await (window as any).api?.testConnection?.()
      setTestResults(results)
    } catch {
      setTestResults(null)
    }
    setIsTesting(false)
  }

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

      {/* Кнопка проверки и результаты */}
      {status === 'connected' && (
        <motion.div variants={itemVariants} style={{ width: '100%', maxWidth: '280px', margin: '0 auto' }}>
          <button
            onClick={handleTestConnection}
            disabled={isTesting}
            style={{
              width: '100%',
              padding: '8px',
              background: 'var(--bg-glass)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              color: 'var(--text-secondary)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: isTesting ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontFamily: 'var(--font-family)',
              transition: 'all 0.2s ease',
              opacity: isTesting ? 0.6 : 1
            }}
          >
            <Wifi size={13} />
            {isTesting ? 'Проверка...' : 'Проверить соединение'}
          </button>
          {testResults && (
            <div style={{
              display: 'flex',
              gap: '4px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: '6px'
            }}>
              {testResults.map(r => (
                <div key={r.name} style={{
                  padding: '2px 7px',
                  borderRadius: '5px',
                  fontSize: '9px',
                  fontWeight: 600,
                  background: r.success ? 'rgba(0,255,65,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${r.success ? 'rgba(0,255,65,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  color: r.success ? '#4ade80' : '#fca5a5',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}>
                  <span style={{
                    width: '5px', height: '5px', borderRadius: '50%',
                    background: r.success ? '#00FF41' : '#ef4444'
                  }} />
                  {r.name}
                  {r.success && <span style={{ opacity: 0.5 }}>{r.latencyMs}ms</span>}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      <motion.div variants={itemVariants} style={{ width: '100%', maxWidth: '280px', margin: '0 auto' }}>
        <TgProxyWidget />
      </motion.div>
    </motion.div>
  )
}

export default MainScreen
