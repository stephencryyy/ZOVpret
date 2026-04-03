// ============================================================================
// TitleBar — Кастомный тайтлбар без стандартной рамки Windows
// ============================================================================

import React from 'react'
import { Minus, X } from 'lucide-react'

const TitleBar: React.FC = () => {
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
          onClick={handleMinimize}
          title="Свернуть"
        >
          <Minus size={16} />
        </button>
        <button
          className="titlebar__btn titlebar__btn--close"
          onClick={handleClose}
          title="Закрыть"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

export default TitleBar
