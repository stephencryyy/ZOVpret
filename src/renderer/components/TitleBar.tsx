// ============================================================================
// TitleBar — Кастомный тайтлбар без стандартной рамки Windows
// ============================================================================

import React from 'react'

interface TitleBarProps {
  onSettingsClick: () => void
}

const TitleBar: React.FC<TitleBarProps> = ({ onSettingsClick }) => {
  const handleMinimize = () => {
    window.api?.minimizeWindow?.()
  }

  const handleClose = () => {
    window.api?.closeWindow?.()
  }

  return (
    <div className="titlebar">
      <div className="titlebar__logo">
        <div className="titlebar__logo-icon">Z</div>
        <span className="titlebar__logo-text">ZOVpret</span>
      </div>

      <div className="titlebar__controls">
        <button
          className="titlebar__btn"
          onClick={onSettingsClick}
          title="Настройки"
        >
          ⚙
        </button>
        <button
          className="titlebar__btn"
          onClick={handleMinimize}
          title="Свернуть"
        >
          ─
        </button>
        <button
          className="titlebar__btn titlebar__btn--close"
          onClick={handleClose}
          title="Закрыть"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export default TitleBar
