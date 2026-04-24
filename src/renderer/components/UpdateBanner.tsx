// ============================================================================
// UpdateBanner — Баннер уведомления о новой версии приложения
// ============================================================================

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, RotateCw, X, CheckCircle2, AlertTriangle } from 'lucide-react'

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface AppUpdateState {
  status: AppUpdateStatus
  currentVersion: string
  newVersion?: string
  releaseNotes?: string
  progress?: {
    percent: number
    bytesPerSecond: number
    transferred: number
    total: number
  }
  error?: string
}

interface UpdateBannerProps {
  state: AppUpdateState | null
  onDownload: () => void
  onInstall: () => void
  onDismiss: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const UpdateBanner: React.FC<UpdateBannerProps> = ({
  state,
  onDownload,
  onInstall,
  onDismiss
}) => {
  if (!state) return null
  const visible =
    state.status === 'available' ||
    state.status === 'downloading' ||
    state.status === 'downloaded' ||
    state.status === 'error'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="update-banner"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          style={{
            // Сдвинут ниже titlebar (40px) + зазор 8px, чтобы никак не
            // перекрывать кнопки закрыть/свернуть
            position: 'absolute',
            top: '48px',
            left: '8px',
            right: '8px',
            // Ниже titlebar (z-index 100+), чтобы при любых анимациях
            // кнопки titlebar оставались кликабельными
            zIndex: 40,
            padding: '10px 12px',
            background: state.status === 'error'
              ? 'rgba(239, 68, 68, 0.15)'
              : state.status === 'downloaded'
              ? 'rgba(0, 255, 65, 0.12)'
              : 'rgba(0, 229, 255, 0.12)',
            border: `1px solid ${
              state.status === 'error'
                ? 'rgba(239, 68, 68, 0.35)'
                : state.status === 'downloaded'
                ? 'rgba(0, 255, 65, 0.3)'
                : 'rgba(0, 229, 255, 0.3)'
            }`,
            borderRadius: '10px',
            backdropFilter: 'blur(15px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '11px',
            color: 'var(--text-primary)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
          }}
        >
          {/* Верхняя строка: иконка + текст + закрыть */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              color:
                state.status === 'error' ? '#fca5a5' :
                state.status === 'downloaded' ? '#4ade80' :
                '#67e8f9',
              display: 'flex',
              flexShrink: 0
            }}>
              {state.status === 'error' ? <AlertTriangle size={14} /> :
               state.status === 'downloaded' ? <CheckCircle2 size={14} /> :
               state.status === 'downloading' ? <RotateCw size={14} className="animate-spin" /> :
               <Download size={14} />}
            </div>
            <div style={{ flex: 1, lineHeight: 1.4 }}>
              {state.status === 'available' && (
                <>Доступна новая версия <strong>v{state.newVersion}</strong></>
              )}
              {state.status === 'downloading' && (
                <>Скачивание v{state.newVersion}: {state.progress?.percent ?? 0}%</>
              )}
              {state.status === 'downloaded' && (
                <>Готово. Перезапустить, чтобы установить v{state.newVersion}?</>
              )}
              {state.status === 'error' && (
                <>Ошибка обновления: {state.error?.substring(0, 80)}</>
              )}
            </div>
            <button
              onClick={onDismiss}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
              aria-label="Закрыть"
            >
              <X size={12} />
            </button>
          </div>

          {/* Прогресс-бар */}
          {state.status === 'downloading' && state.progress && (
            <>
              <div style={{
                height: '4px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '2px',
                overflow: 'hidden'
              }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${state.progress.percent}%` }}
                  transition={{ duration: 0.3 }}
                  style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, #00e5ff, #00FF41)'
                  }}
                />
              </div>
              <div style={{
                fontSize: '9px',
                color: 'var(--text-muted)',
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                <span>{formatBytes(state.progress.transferred)} / {formatBytes(state.progress.total)}</span>
                <span>{formatBytes(state.progress.bytesPerSecond)}/с</span>
              </div>
            </>
          )}

          {/* Кнопки действий */}
          {state.status === 'available' && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
              <button
                onClick={onDownload}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: 'var(--accent-gradient)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#020205',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-family)'
                }}
              >
                Установить
              </button>
              <button
                onClick={onDismiss}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-family)'
                }}
              >
                Позже
              </button>
            </div>
          )}

          {state.status === 'downloaded' && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
              <button
                onClick={onInstall}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: 'var(--accent-gradient)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#020205',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-family)'
                }}
              >
                Перезапустить
              </button>
              <button
                onClick={onDismiss}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-family)'
                }}
              >
                Позже
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default UpdateBanner
