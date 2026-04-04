import React, { useState, useEffect, useCallback } from 'react'
import { Send, ExternalLink, Copy, Check } from 'lucide-react'

interface TgProxyState {
  status: string
  host: string
  port: number
  secret: string
  tgLink: string
  installed: boolean
}

const TgProxyWidget: React.FC = () => {
  const [tgProxy, setTgProxy] = useState<TgProxyState | null>(null)
  const [tgLoading, setTgLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    ;(window as any).api?.getTgProxyState?.().then((state: TgProxyState) => {
      setTgProxy(state)
    }).catch(() => {})

    const unsub = (window as any).api?.onTgProxyStatusChange?.((status: string) => {
      setTgProxy(prev => prev ? { ...prev, status } : null)
      setTgLoading(false)
    })
    return () => unsub?.()
  }, [])

  const toggleTgProxy = useCallback(async () => {
    if (!tgProxy) return
    setTgLoading(true)
    try {
      if (tgProxy.status === 'running') {
        const result = await (window as any).api.stopTgProxy()
        setTgProxy(prev => prev ? { ...prev, ...result } : null)
      } else {
        const result = await (window as any).api.startTgProxy()
        setTgProxy(prev => prev ? { ...prev, ...result } : null)
      }
    } catch { /* handled via status event */ }
    setTgLoading(false)
  }, [tgProxy])

  const openTgLink = useCallback(() => {
    (window as any).api?.openTgProxyLink?.()
  }, [])

  const copySecret = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (tgProxy?.secret) {
      navigator.clipboard.writeText(tgProxy.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [tgProxy])

  if (!tgProxy) return null

  return (
    <div className="tg-proxy-widget" style={{ 
      background: 'var(--bg-glass)', 
      borderRadius: 'var(--radius-md)', 
      border: '1px solid var(--border-glass)',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
        <Send size={14} /> Telegram Proxy
      </div>

      {!tgProxy.installed ? (
        <div style={{ fontSize: '11px', color: 'var(--color-warning)' }}>
          TgWsProxy_windows.exe не установлен в папку bin/. Скачайте с GitHub.
        </div>
      ) : (
        <>
          <div
            onClick={toggleTgProxy}
            style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
              cursor: 'pointer',
              padding: '6px 0'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                MTProto WS Proxy
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                {tgLoading ? 'Переключение...' :
                  tgProxy.status === 'running'
                  ? `Активен на порту ${tgProxy.port}`
                  : 'Нажмите для запуска'}
              </div>
            </div>
            
            <div style={{
              width: '36px', height: '20px',
              borderRadius: '10px',
              background: tgProxy.status === 'running' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
              border: '1px solid var(--border-subtle)',
              position: 'relative',
              transition: 'background 0.2s ease',
              flexShrink: 0
            }}>
              <div style={{
                width: '16px', height: '16px',
                borderRadius: '50%',
                background: '#fff',
                position: 'absolute',
                top: '1px',
                left: tgProxy.status === 'running' ? '17px' : '1px',
                transition: 'left 0.2s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
              }} />
            </div>
          </div>

          {tgProxy.status === 'running' && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '8px',
              padding: '8px',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              marginTop: '4px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Secret</span>
                <button
                  onClick={copySecret}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                    transition: 'color 0.15s'
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Скопировано' : 'Копия'}
                </button>
              </div>
              <button
                onClick={openTgLink}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '6px', padding: '8px',
                  background: 'var(--accent-gradient)',
                  border: 'none', borderRadius: '6px', cursor: 'pointer',
                  color: '#fff', fontSize: '11px', fontWeight: 600,
                  fontFamily: 'var(--font-family)',
                  transition: 'opacity 0.15s'
                }}
              >
                <ExternalLink size={14} /> Подключить
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default TgProxyWidget
