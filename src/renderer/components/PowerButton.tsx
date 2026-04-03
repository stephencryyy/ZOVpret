// ============================================================================
// PowerButton — Центральная анимированная кнопка START/STOP
// ============================================================================

import React from 'react'

type Status = 'disconnected' | 'analyzing' | 'connecting' | 'connected' | 'error'

interface PowerButtonProps {
  status: Status
  onClick: () => void
  disabled?: boolean
}

/** SVG иконка Power */
const PowerIcon: React.FC<{ status: Status }> = ({ status }) => (
  <svg
    className={`power-icon power-icon--${status}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    <line x1="12" y1="2" x2="12" y2="12" />
  </svg>
)

const PowerButton: React.FC<PowerButtonProps> = ({ status, onClick, disabled }) => {
  const isActive = status === 'connected'
  const isAnalyzing = status === 'analyzing' || status === 'connecting'

  // Вычисляем длину окружности SVG (r=80 → C = 2πr ≈ 502)
  const circumference = 502

  return (
    <div className="power-btn-container">
      {/* Фоновое свечение */}
      <div
        className={`power-btn-glow ${
          isActive ? 'power-btn-glow--active' :
          isAnalyzing ? 'power-btn-glow--analyzing' : ''
        }`}
      />

      {/* Кольцо прогресса */}
      <svg className="power-btn-ring" viewBox="0 0 172 172">
        <circle
          className="power-btn-ring__circle"
          cx="86"
          cy="86"
          r="80"
        />
        <circle
          className={`power-btn-ring__progress ${
            isActive ? 'power-btn-ring__progress--connected' :
            isAnalyzing ? 'power-btn-ring__progress--analyzing' : ''
          }`}
          cx="86"
          cy="86"
          r="80"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: isActive ? 0 : circumference,
          }}
        />
      </svg>

      {/* Кнопка */}
      <button
        className={`power-btn power-btn--${status}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={isActive ? 'Остановить' : 'Запустить'}
      >
        <PowerIcon status={status} />
      </button>
    </div>
  )
}

export default PowerButton
