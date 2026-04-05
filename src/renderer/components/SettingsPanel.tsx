// ============================================================================
// SettingsPanel — Slide-in панель настроек
// ============================================================================

import React, { useState } from 'react'
import { ChevronLeft, Settings2, Target, List, Info, Ghost, Zap, Shuffle } from 'lucide-react'

interface Strategy {
  id: string
  name: string
  description: string
  category: string
}


interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  strategies: Strategy[]
  currentStrategyId: string | null
  onStrategyChange: (id: string) => void
  logs: Array<{ timestamp: number; level: string; message: string }>
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  strategies,
  currentStrategyId,
  onStrategyChange,
  logs
}) => {
  const [activeTab, setActiveTab] = useState<'strategies' | 'logs' | 'about'>('strategies')

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
  }

  // Категории с иконками Lucide
  const CategoryIcon = ({ category }: { category: string }) => {
    switch (category) {
      case 'general': return <Target size={14} />
      case 'alt': return <Shuffle size={14} />
      case 'fake_tls': return <Ghost size={14} />
      case 'simple_fake': return <Zap size={14} />
      default: return <List size={14} />
    }
  }

  const categoryLabels: Record<string, string> = {
    general: 'Базовые',
    alt: 'Альтернативные',
    fake_tls: 'Fake TLS',
    simple_fake: 'Простые'
  }

  // Группируем стратегии по категориям
  const grouped = strategies.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {} as Record<string, Strategy[]>)

  return (
    <>
      {/* Overlay */}
      <div
        className={`settings-overlay ${isOpen ? 'settings-overlay--open' : ''}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`settings-panel ${isOpen ? 'settings-panel--open' : ''}`}>
        <div className="settings-header">
          <button className="settings-header__back" onClick={onClose}>
            <ChevronLeft size={16} /> Назад
          </button>
          <span className="settings-header__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings2 size={16} /> Настройки
          </span>
          <div style={{ width: '80px' }} />
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '2px',
          padding: '8px 20px 0',
          borderBottom: '1px solid var(--border-subtle)'
        }}>
          {(['strategies', 'logs', 'about'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                background: activeTab === tab ? 'var(--bg-glass)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--accent-primary)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--font-family)',
                fontSize: '12px',
                fontWeight: 600,
                transition: 'all 0.2s ease',
                borderRadius: '6px 6px 0 0',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {tab === 'strategies' ? <><Target size={14}/> Профили</> :
               tab === 'logs' ? <><List size={14}/> Логи</> : <><Info size={14}/> Инфо</>}
            </button>
          ))}
        </div>

        <div className="settings-body">
          {/* ─── Вкладка: Стратегии ─────────────── */}
          {activeTab === 'strategies' && (
            <>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Выберите профиль обхода. Умный поиск (Auto) автоматически подберёт оптимальный.
              </div>

              <div className="settings-section">
                <div className="settings-section__title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={14} /> Умный поиск
                </div>
                <div
                  className={`settings-item ${
                    currentStrategyId === 'auto' || currentStrategyId === null ? 'settings-item--active' : ''
                  }`}
                  onClick={() => onStrategyChange('auto')}
                >
                  <div className="settings-item__left">
                    <div className="settings-item__name">Auto (Быстрый поиск)</div>
                    <div className="settings-item__desc">Останавливается на первой идеальной стратегии</div>
                  </div>
                  <div className={`settings-item__check ${
                    currentStrategyId === 'auto' || currentStrategyId === null ? 'settings-item__check--active' : ''
                  }`}>
                    {(currentStrategyId === 'auto' || currentStrategyId === null) && (
                      <span style={{ color: '#020205', fontSize: '10px', fontWeight: 900 }}>✓</span>
                    )}
                  </div>
                </div>

                <div
                  className={`settings-item ${
                    currentStrategyId === 'auto-deep' ? 'settings-item--active' : ''
                  }`}
                  onClick={() => onStrategyChange('auto-deep')}
                >
                  <div className="settings-item__left">
                    <div className="settings-item__name">Auto (Глубокий анализ)</div>
                    <div className="settings-item__desc">Тестирует всё для поиска наименьшего пинга (~1 мин)</div>
                  </div>
                  <div className={`settings-item__check ${
                    currentStrategyId === 'auto-deep' ? 'settings-item__check--active' : ''
                  }`}>
                    {currentStrategyId === 'auto-deep' && (
                      <span style={{ color: '#020205', fontSize: '10px', fontWeight: 900 }}>✓</span>
                    )}
                  </div>
                </div>
              </div>

              {Object.entries(grouped).map(([category, items]) => (
                <div className="settings-section" key={category}>
                  <div className="settings-section__title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CategoryIcon category={category} />
                    {categoryLabels[category] || category}
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '4px' }}>
                      ({items.length})
                    </span>
                  </div>
                  {items.map(strategy => (
                    <div
                      key={strategy.id}
                      className={`settings-item ${
                        currentStrategyId === strategy.id ? 'settings-item--active' : ''
                      }`}
                      onClick={() => onStrategyChange(strategy.id)}
                    >
                      <div className="settings-item__left">
                        <div className="settings-item__name">{strategy.name}</div>
                        <div className="settings-item__desc">{strategy.description}</div>
                      </div>
                      <div className={`settings-item__check ${
                        currentStrategyId === strategy.id ? 'settings-item__check--active' : ''
                      }`}>
                        {currentStrategyId === strategy.id && (
                          <span style={{ color: '#020205', fontSize: '10px', fontWeight: 900 }}>✓</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

          {/* ─── Вкладка: Логи ─────────────────── */}
          {activeTab === 'logs' && (
            <div className="log-viewer" style={{ maxHeight: '100%', flex: 1 }}>
              {logs.length === 0 && (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                  Терминал пуст. Логи появятся после запуска движка.
                </div>
              )}
              {logs.slice(-200).map((entry, i) => (
                <div className="log-entry" key={i}>
                  <span className="log-entry__time">{formatTime(entry.timestamp)}</span>
                  <span className={`log-entry__msg log-entry__msg--${entry.level}`}>
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ─── Вкладка: О программе ──────────── */}
          {activeTab === 'about' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{
                  width: '48px', height: '48px',
                  background: 'var(--accent-gradient)',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  fontWeight: 900,
                  marginBottom: '12px',
                  color: '#fff'
                }}>Z</div>
                <div style={{ fontSize: '18px', fontWeight: 800 }}>ZOVpret</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  v1.1.0 — GUI для zapret DPI bypass
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-section__title">Компоненты</div>
                <div className="settings-item" style={{ cursor: 'default' }}>
                  <div className="settings-item__left">
                    <div className="settings-item__name">Стратегии</div>
                    <div className="settings-item__desc">Flowseal/zapret-discord-youtube v1.9.7b (20 профилей)</div>
                  </div>
                </div>
                <div className="settings-item" style={{ cursor: 'default' }}>
                  <div className="settings-item__left">
                    <div className="settings-item__name">Ядро</div>
                    <div className="settings-item__desc">bol-van/zapret (winws.exe)</div>
                  </div>
                </div>
                <div className="settings-item" style={{ cursor: 'default' }}>
                  <div className="settings-item__left">
                    <div className="settings-item__name">Telegram Proxy</div>
                    <div className="settings-item__desc">Flowseal/tg-ws-proxy (MTProto WS Bridge)</div>
                  </div>
                </div>
              </div>

              <div style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                textAlign: 'center',
                lineHeight: 1.6,
                marginTop: '8px'
              }}>
                Свободное ПО. Не является VPN/прокси.<br/>
                Модифицирует сетевые пакеты локально через WinDivert.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default SettingsPanel
