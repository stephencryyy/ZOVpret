// ============================================================================
// ZOVpret — Автообновление бинарников с GitHub
// ============================================================================
// Проверяет последний релиз Flowseal/zapret-discord-youtube, скачивает ZIP,
// распаковывает бинарники (winws.exe, WinDivert*) и списки.
// ============================================================================

import https from 'https'
import { createWriteStream, existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import AdmZip from 'adm-zip'
import { setConfig, getConfig } from './config-store'

const GITHUB_API = 'https://api.github.com/repos/Flowseal/zapret-discord-youtube/releases/latest'
const USER_AGENT = 'ZOVpret-Updater/1.0'

export interface UpdateInfo {
  available: boolean
  currentVersion: string | null
  latestVersion: string
  downloadUrl: string
  releaseNotes: string
}

/**
 * Проверить наличие обновлений на GitHub
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const config = getConfig()

  return new Promise((resolve, reject) => {
    const url = new URL(GITHUB_API)

    https.get(
      {
        hostname: url.hostname,
        path: url.pathname,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/vnd.github.v3+json'
        }
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const release = JSON.parse(data)
            const latestVersion = release.tag_name || release.name || 'unknown'
            const currentVersion = config.binVersion

            // Ищем ZIP-ассет для Windows
            const asset = release.assets?.find(
              (a: any) =>
                a.name.endsWith('.zip') &&
                !a.name.includes('source')
            )

            resolve({
              available: currentVersion !== latestVersion,
              currentVersion,
              latestVersion,
              downloadUrl: asset?.browser_download_url || '',
              releaseNotes: release.body || ''
            })
          } catch (err) {
            reject(new Error('Ошибка разбора ответа GitHub API'))
          }
        })
      }
    ).on('error', reject)
  })
}

/**
 * Скачать файл по URL с поддержкой редиректов
 */
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath)
    const doGet = (getUrl: string, redirectCount = 0): void => {
      if (redirectCount > 5) {
        reject(new Error('Слишком много редиректов'))
        return
      }

      const parsedUrl = new URL(getUrl)
      const protocol = parsedUrl.protocol === 'https:' ? https : https

      protocol.get(
        {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: { 'User-Agent': USER_AGENT }
        },
        (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const location = res.headers.location
            if (location) {
              doGet(location, redirectCount + 1)
              return
            }
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }

          res.pipe(file)
          file.on('finish', () => {
            file.close()
            resolve()
          })
        }
      ).on('error', (err) => {
        file.close()
        reject(err)
      })
    }

    doGet(url)
  })
}

/**
 * Выполнить обновление: скачать и распаковать бинарники
 */
export async function performUpdate(
  resourcesPath: string,
  onProgress?: (message: string) => void
): Promise<void> {
  const binPath = join(resourcesPath, 'bin')
  const listsPath = join(resourcesPath, 'lists')
  const tempPath = join(resourcesPath, 'temp')

  // Создаём директории если не существуют
  for (const dir of [binPath, listsPath, tempPath]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  // 1. Проверяем обновления
  onProgress?.('Проверка обновлений...')
  const updateInfo = await checkForUpdate()

  if (!updateInfo.downloadUrl) {
    throw new Error('Не удалось найти архив для скачивания')
  }

  // 2. Скачиваем ZIP
  const zipPath = join(tempPath, 'zapret-update.zip')
  onProgress?.(`Скачивание ${updateInfo.latestVersion}...`)
  await downloadFile(updateInfo.downloadUrl, zipPath)

  // 3. Распаковываем
  onProgress?.('Распаковка...')
  const zip = new AdmZip(zipPath)
  const zipEntries = zip.getEntries()

  // Ищем и копируем бинарники
  const binFiles = [
    'winws.exe',
    'WinDivert.dll',
    'WinDivert32.sys',
    'WinDivert64.sys',
    'cygwin1.dll',
    'quic_initial_www_google_com.bin',
    'tls_clienthello_www_google_com.bin',
    'tls_clienthello_4pda_to.bin',
    'tls_clienthello_max_ru.bin',
    'stun.bin'
  ]

  const listFiles = [
    'list-general.txt',
    'list-google.txt',
    'list-exclude.txt',
    'ipset-all.txt',
    'ipset-exclude.txt'
  ]

  for (const entry of zipEntries) {
    const entryName = basename(entry.entryName)

    if (binFiles.includes(entryName)) {
      onProgress?.(`Извлечение: ${entryName}`)
      zip.extractEntryTo(entry, binPath, false, true)
    }

    if (listFiles.includes(entryName)) {
      onProgress?.(`Извлечение списка: ${entryName}`)
      zip.extractEntryTo(entry, listsPath, false, true)
    }
  }

  // 4. Создаём пустые user-файлы если не существуют
  const userFiles = [
    join(listsPath, 'list-general-user.txt'),
    join(listsPath, 'list-exclude-user.txt'),
    join(listsPath, 'ipset-exclude-user.txt')
  ]

  for (const f of userFiles) {
    if (!existsSync(f)) {
      require('fs').writeFileSync(f, '', 'utf-8')
    }
  }

  // 5. Обновляем версию в конфиге
  setConfig({ binVersion: updateInfo.latestVersion })
  onProgress?.(`Обновление завершено: ${updateInfo.latestVersion}`)

  // 6. Чистим временные файлы
  try {
    require('fs').unlinkSync(zipPath)
    require('fs').rmdirSync(tempPath, { recursive: true })
  } catch { /* ignore */ }
}

/**
 * Проверить, установлены ли бинарники
 */
export function areBinariesInstalled(resourcesPath: string): boolean {
  const binPath = join(resourcesPath, 'bin')
  const required = ['winws.exe', 'WinDivert.dll', 'WinDivert64.sys']
  return required.every(f => existsSync(join(binPath, f)))
}
