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

/** Результат теста по одному домену */
export interface DomainResult {
  name: string
  success: boolean
  latencyMs: number
}

/** Результат Smart Start */
export interface SmartStartResult {
  success: boolean
  strategy?: {
    id: string
    name: string
  }
  domainResults?: DomainResult[]
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
  lastStrategyId: string | null
  filterMode: 'hostlist' | 'all'
  autoUpdate: boolean
  binVersion: string | null
  customDomains: string[]
  autoStart: boolean
  startMinimized: boolean
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
  startEngine: (strategyId?: string) => Promise<any>
  stopEngine: () => Promise<any>
  getEngineState: () => Promise<EngineState>

  // Smart Start
  runSmartStart: (deepAnalysis?: boolean) => Promise<SmartStartResult>
  abortSmartStart: () => Promise<void>

  // Настройки
  getConfig: () => Promise<AppConfig>
  setConfig: (config: Partial<AppConfig>) => Promise<void>

  // Стратегии
  getStrategies: () => Promise<Strategy[]>
  setStrategy: (id: string) => Promise<void>

  // Обновления
  checkUpdate: () => Promise<UpdateInfo>
  performUpdate: () => Promise<any>
  areBinariesInstalled: () => Promise<boolean>

  // Окно
  minimizeWindow: () => void
  closeWindow: () => void

  // Подписка на события
  onStatusChange: (callback: (status: string) => void) => () => void
  onLog: (callback: (entry: LogEntry) => void) => () => void
  onSmartStartProgress: (callback: (data: { current: number; total: number; strategyName: string; domainResults?: DomainResult[] }) => void) => () => void
  onUpdateProgress: (callback: (message: string) => void) => () => void
}

declare global {
  interface Window {
    api: ZovpretAPI
  }
}
