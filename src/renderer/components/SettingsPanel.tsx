// ============================================================================
// SettingsPanel — Slide-in панель настроек
// ============================================================================

import React, { useState, useEffect } from 'react'
import { ChevronLeft, Settings2, Target, List, Info, Ghost, Zap, Shuffle, Globe, Plus, X } from 'lucide-react'

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

const LogsTab: React.FC<{
  logs: Array<{ timestamp: number; level: string; message: string }>
  formatTime: (ts: number) => string
}> = ({ logs, formatTime }) => {
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all')

  const filtered = logs.slice(-200).filter(entry => {
    if (levelFilter !== 'all' && entry.level !== levelFilter) return false
    if (search && !entry.message.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '8px' }}>
      {/* Поиск и фильтры */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск в логах..."
          style={{
            flex: 1,
            padding: '5px 10px',
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            fontSize: '10px',
            fontFamily: 'var(--font-family)',
            outline: 'none'
          }}
        />
        {(['all', 'error', 'warn', 'info'] as const).map(level => (
          <button
            key={level}
            onClick={() => setLevelFilter(level)}
            style={{
              padding: '4px 8px',
              background: levelFilter === level ? (
                level === 'error' ? 'rgba(239,68,68,0.2)' :
                level === 'warn' ? 'rgba(245,158,11,0.2)' :
                'var(--bg-glass)'
              ) : 'transparent',
              border: `1px solid ${levelFilter === level ? 'var(--border-subtle)' : 'transparent'}`,
              borderRadius: '4px',
              color: levelFilter === level ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: '9px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-family)'
            }}
          >
            {level === 'all' ? 'Все' : level}
          </button>
        ))}
      </div>
      {/* Логи */}
      <div className="log-viewer" style={{ maxHeight: '100%', flex: 1 }}>
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
            {logs.length === 0 ? 'Терминал пуст. Логи появятся после запуска движка.' : 'Ничего не найдено'}
          </div>
        )}
        {filtered.map((entry, i) => (
          <div className="log-entry" key={i}>
            <span className="log-entry__time">{formatTime(entry.timestamp)}</span>
            <span className={`log-entry__msg log-entry__msg--${entry.level}`}>
              {entry.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  strategies,
  currentStrategyId,
  onStrategyChange,
  logs
}) => {
  const [activeTab, setActiveTab] = useState<'strategies' | 'domains' | 'logs' | 'about'>('strategies')
  const [appVersion, setAppVersion] = useState('...')
  const [customDomains, setCustomDomains] = useState<string[]>([])
  const [excludeDomains, setExcludeDomains] = useState<string[]>([])
  const [newCustomDomain, setNewCustomDomain] = useState('')
  const [newExcludeDomain, setNewExcludeDomain] = useState('')

  useEffect(() => {
    ;(window as any).api?.getAppVersion?.().then((v: string) => {
      if (v) setAppVersion(v)
    }).catch(() => {})
    ;(window as any).api?.getCustomDomains?.().then((d: string[]) => {
      if (d) setCustomDomains(d)
    }).catch(() => {})
    ;(window as any).api?.getExcludeDomains?.().then((d: string[]) => {
      if (d) setExcludeDomains(d)
    }).catch(() => {})
  }, [])

  const addCustomDomain = () => {
    const d = newCustomDomain.trim().toLowerCase()
    if (!d || customDomains.includes(d)) return
    const updated = [...customDomains, d]
    setCustomDomains(updated)
    setNewCustomDomain('')
    ;(window as any).api?.setCustomDomains?.(updated)
  }

  const removeCustomDomain = (domain: string) => {
    const updated = customDomains.filter(d => d !== domain)
    setCustomDomains(updated)
    ;(window as any).api?.setCustomDomains?.(updated)
  }

  const addExcludeDomain = () => {
    const d = newExcludeDomain.trim().toLowerCase()
    if (!d || excludeDomains.includes(d)) return
    const updated = [...excludeDomains, d]
    setExcludeDomains(updated)
    setNewExcludeDomain('')
    ;(window as any).api?.setExcludeDomains?.(updated)
  }

  const removeExcludeDomain = (domain: string) => {
    const updated = excludeDomains.filter(d => d !== domain)
    setExcludeDomains(updated)
    ;(window as any).api?.setExcludeDomains?.(updated)
  }

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
          {(['strategies', 'domains', 'logs', 'about'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 12px',
                background: activeTab === tab ? 'var(--bg-glass)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--accent-primary)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--font-family)',
                fontSize: '11px',
                fontWeight: 600,
                transition: 'all 0.2s ease',
                borderRadius: '6px 6px 0 0',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              {tab === 'strategies' ? <><Target size={13}/> Профили</> :
               tab === 'domains' ? <><Globe size={13}/> Домены</> :
               tab === 'logs' ? <><List size={13}/> Логи</> : <><Info size={13}/> Инфо</>}
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

          {/* ─── Вкладка: Домены ────────────────── */}
          {activeTab === 'domains' && (
            <>
              {/* Свои домены */}
              <div className="settings-section">
                <div className="settings-section__title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plus size={14} /> Свои домены
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.5 }}>
                  Добавьте домены, которые нужно обходить помимо основного списка.
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={newCustomDomain}
                    onChange={(e) => setNewCustomDomain(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomDomain()}
                    placeholder="example.com"
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      background: 'var(--bg-glass)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-family)',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={addCustomDomain}
                    style={{
                      padding: '6px 12px',
                      background: 'var(--accent-gradient)',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#020205',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                {customDomains.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', textAlign: 'center', padding: '8px' }}>
                    Пользовательский список пуст
                  </div>
                )}
                {customDomains.map(domain => (
                  <div
                    key={domain}
                    className="settings-item"
                    style={{ padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{domain}</span>
                    <button
                      onClick={() => removeCustomDomain(domain)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#ef4444',
                        padding: '2px',
                        display: 'flex'
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Исключения */}
              <div className="settings-section">
                <div className="settings-section__title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <X size={14} /> Исключения
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.5 }}>
                  Домены, для которых НЕ применять обход DPI (банки, гос. сайты и т.п.)
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={newExcludeDomain}
                    onChange={(e) => setNewExcludeDomain(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addExcludeDomain()}
                    placeholder="sberbank.ru"
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      background: 'var(--bg-glass)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-family)',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={addExcludeDomain}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      color: '#fca5a5',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                {excludeDomains.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', textAlign: 'center', padding: '8px' }}>
                    Список исключений пуст
                  </div>
                )}
                {excludeDomains.map(domain => (
                  <div
                    key={domain}
                    className="settings-item"
                    style={{ padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{domain}</span>
                    <button
                      onClick={() => removeExcludeDomain(domain)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#ef4444',
                        padding: '2px',
                        display: 'flex'
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ─── Вкладка: Логи ─────────────────── */}
          {activeTab === 'logs' && (
            <LogsTab logs={logs} formatTime={formatTime} />
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
                  v{appVersion} — GUI для zapret DPI bypass
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
