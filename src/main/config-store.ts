// ============================================================================
// ZOVpret — Хранилище настроек (electron-store)
// ============================================================================
import Store from 'electron-store'

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

const defaults: AppConfig = {
  lastStrategyId: 'auto',
  filterMode: 'hostlist',
  autoUpdate: true,
  binVersion: null,
  customDomains: [],
  autoStart: false,
  startMinimized: false,
  logLevel: 'info'
}

const store = new Store<AppConfig>({
  name: 'zovpret-config',
  defaults
})

export function getConfig(): AppConfig {
  return {
    lastStrategyId: store.get('lastStrategyId'),
    filterMode: store.get('filterMode'),
    autoUpdate: store.get('autoUpdate'),
    binVersion: store.get('binVersion'),
    customDomains: store.get('customDomains'),
    autoStart: store.get('autoStart'),
    startMinimized: store.get('startMinimized'),
    logLevel: store.get('logLevel')
  }
}

export function setConfig(partial: Partial<AppConfig>): void {
  for (const [key, value] of Object.entries(partial)) {
    store.set(key as keyof AppConfig, value)
  }
}

export { store }
