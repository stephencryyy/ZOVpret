// ============================================================================
// ZOVpret — Типы и интерфейсы
// ============================================================================

/** Статус подключения приложения */
export type ConnectionStatus =
  | 'disconnected'
  | 'analyzing'
  | 'connecting'
  | 'connected'
  | 'error'

/** Информация о стратегии обхода DPI */
export interface Strategy {
  id: string
  name: string
  description: string
  /** Аргументы для winws.exe (массив строк) */
  args: string[]
  /** Категория: general, alt, fake_tls, simple_fake */
  category: 'general' | 'alt' | 'fake_tls' | 'simple_fake' | 'custom'
}

/** Результат тестирования стратегии */
export interface StrategyTestResult {
  strategyId: string
  success: boolean
  latencyMs: number
  error?: string
}

/** Состояние движка zapret */
export interface EngineState {
  status: ConnectionStatus
  currentStrategy: Strategy | null
  pid: number | null
  uptime: number
  logs: LogEntry[]
}

/** Запись лога */
export interface LogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

/** Настройки приложения */
export interface AppConfig {
  /** Последняя рабочая стратегия */
  lastStrategyId: string | null
  /** Режим фильтрации: hostlist или all */
  filterMode: 'hostlist' | 'all'
  /** Автообновление бинарников */
  autoUpdate: boolean
  /** Версия бинарников */
  binVersion: string | null
  /** Пользовательские домены */
  customDomains: string[]
  /** Автозапуск при старте приложения */
  autoStart: boolean
  /** Запускаться свёрнутым */
  startMinimized: boolean
  /** Уровень логирования */
  logLevel: 'info' | 'debug'
}

/** Информация об обновлении */
export interface UpdateInfo {
  available: boolean
  currentVersion: string | null
  latestVersion: string
  downloadUrl: string
  releaseNotes: string
}

/** IPC API, доступное из renderer */
export interface ZovpretAPI {
  // Управление движком
  startEngine: () => Promise<void>
  stopEngine: () => Promise<void>
  getEngineState: () => Promise<EngineState>

  // Smart Start
  runSmartStart: () => Promise<StrategyTestResult>

  // Настройки
  getConfig: () => Promise<AppConfig>
  setConfig: (config: Partial<AppConfig>) => Promise<void>

  // Стратегии
  getStrategies: () => Promise<Strategy[]>
  setStrategy: (id: string) => Promise<void>

  // Обновления
  checkUpdate: () => Promise<UpdateInfo>
  performUpdate: () => Promise<void>

  // Подписка на события
  onStatusChange: (callback: (status: ConnectionStatus) => void) => () => void
  onLog: (callback: (entry: LogEntry) => void) => () => void
  onSmartStartProgress: (callback: (data: { current: number; total: number; strategyName: string }) => void) => () => void
}

declare global {
  interface Window {
    api: ZovpretAPI
  }
}
