// ============================================================================
// ZOVpret — Пул стратегий (из Flowseal/zapret-discord-youtube)
// ============================================================================
// Каждая стратегия — это набор аргументов для winws.exe, извлечённый из
// реальных .bat файлов Flowseal. Стратегии упорядочены по вероятности успеха.
// При Smart Start они перебираются последовательно.
// ============================================================================

export interface Strategy {
  id: string
  name: string
  description: string
  args: string[]
  category: 'general' | 'alt' | 'fake_tls' | 'simple_fake' | 'custom'
}

/**
 * Генерирует полный набор аргументов для winws.exe на основе стратегии.
 * Подставляет реальные пути к bin/ и lists/ директориям.
 */
export function buildStrategyArgs(
  strategy: Strategy,
  binPath: string,
  listsPath: string
): string[] {
  return strategy.args.map(arg =>
    arg
      .replace(/\{BIN\}/g, binPath)
      .replace(/\{LISTS\}/g, listsPath)
  )
}

/**
 * Все стратегии из Flowseal, адаптированные для нашего приложения.
 * {BIN} и {LISTS} — плейсхолдеры, заменяемые на реальные пути при запуске.
 */
export const STRATEGIES: Strategy[] = [
  // ─────────────────────────────────────────────────────────────
  // 1. GENERAL — Основная стратегия (multisplit + seqovl)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'general',
    name: 'General',
    description: 'Основная стратегия: multisplit + sequence overlap. Работает у большинства провайдеров.',
    category: 'general',
    args: [
      '--wf-tcp=80,443,2053,2083,2087,2096,8443',
      '--wf-udp=443,19294-19344,50000-50100',
      // Профиль 1: QUIC фейки для UDP
      '--filter-udp=443',
      '--hostlist={LISTS}list-general.txt',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      // Профиль 2: Discord/STUN UDP
      '--filter-udp=19294-19344,50000-50100',
      '--filter-l7=discord,stun',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--new',
      // Профиль 3: Discord media TCP
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=multisplit',
      '--dpi-desync-split-seqovl=681',
      '--dpi-desync-split-pos=1',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      // Профиль 4: Google сервисы (YouTube, etc)
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt',
      '--ip-id=zero',
      '--dpi-desync=multisplit',
      '--dpi-desync-split-seqovl=681',
      '--dpi-desync-split-pos=1',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      // Профиль 5: Общий TCP (Instagram, Twitter, etc)
      '--filter-tcp=80,443',
      '--hostlist={LISTS}list-general.txt',
      '--dpi-desync=multisplit',
      '--dpi-desync-split-seqovl=568',
      '--dpi-desync-split-pos=1',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_4pda_to.bin'
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // 2. ALT — Альтернативная (fake + fakedsplit + ts fooling)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'alt',
    name: 'ALT',
    description: 'Альтернативная: fake+fakedsplit с TS fooling. Для провайдеров, блокирующих General.',
    category: 'alt',
    args: [
      '--wf-tcp=80,443,2053,2083,2087,2096,8443',
      '--wf-udp=443,19294-19344,50000-50100',
      '--filter-udp=443',
      '--hostlist={LISTS}list-general.txt',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      '--filter-udp=19294-19344,50000-50100',
      '--filter-l7=discord,stun',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=fake,fakedsplit',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-fakedsplit-pattern=0x00',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt',
      '--ip-id=zero',
      '--dpi-desync=fake,fakedsplit',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-fakedsplit-pattern=0x00',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=80,443',
      '--hostlist={LISTS}list-general.txt',
      '--dpi-desync=fake,fakedsplit',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-fakedsplit-pattern=0x00',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-http={BIN}tls_clienthello_max_ru.bin'
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // 3. FAKE TLS AUTO — Рандомизация TLS (самая продвинутая)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'fake_tls_auto',
    name: 'FAKE TLS AUTO',
    description: 'Максимальная обфускация: рандомные фейковые TLS + badseq fooling + multidisorder.',
    category: 'fake_tls',
    args: [
      '--wf-tcp=80,443,2053,2083,2087,2096,8443',
      '--wf-udp=443,19294-19344,50000-50100',
      '--filter-udp=443',
      '--hostlist={LISTS}list-general.txt',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=11',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      '--filter-udp=19294-19344,50000-50100',
      '--filter-l7=discord,stun',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=fake,multidisorder',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=11',
      '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls=0x00000000',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt',
      '--ip-id=zero',
      '--dpi-desync=fake,multidisorder',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=11',
      '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls=0x00000000',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com',
      '--new',
      '--filter-tcp=80,443',
      '--hostlist={LISTS}list-general.txt',
      '--dpi-desync=fake,multidisorder',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=11',
      '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls=0x00000000',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com',
      '--dpi-desync-fake-http={BIN}tls_clienthello_max_ru.bin'
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // 4. SIMPLE FAKE — Простая стратегия (только fake)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'simple_fake',
    name: 'SIMPLE FAKE',
    description: 'Простая стратегия: только fake пакеты. Минимальное воздействие.',
    category: 'simple_fake',
    args: [
      '--wf-tcp=80,443,2053,2083,2087,2096,8443',
      '--wf-udp=443,19294-19344,50000-50100',
      '--filter-udp=443',
      '--hostlist={LISTS}list-general.txt',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      '--filter-udp=19294-19344,50000-50100',
      '--filter-l7=discord,stun',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--new',
      '--filter-tcp=80,443,2053,2083,2087,2096,8443',
      '--hostlist={LISTS}list-general.txt',
      '--hostlist={LISTS}list-google.txt',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin'
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // 5. ALT2 — Альтернативная #2 (disorder + md5sig)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'alt2',
    name: 'ALT 2',
    description: 'Альтернативная #2: multidisorder + md5sig fooling.',
    category: 'alt',
    args: [
      '--wf-tcp=80,443,2053,2083,2087,2096,8443',
      '--wf-udp=443,19294-19344,50000-50100',
      '--filter-udp=443',
      '--hostlist={LISTS}list-general.txt',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      '--filter-udp=19294-19344,50000-50100',
      '--filter-l7=discord,stun',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--new',
      '--filter-tcp=80,443,2053,2083,2087,2096,8443',
      '--hostlist={LISTS}list-general.txt',
      '--hostlist={LISTS}list-google.txt',
      '--dpi-desync=fake,multidisorder',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=8',
      '--dpi-desync-fooling=md5sig',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin'
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // 6. ALT3 — hopbyhop + multisplit
  // ─────────────────────────────────────────────────────────────
  {
    id: 'alt3',
    name: 'ALT 3',
    description: 'Альтернативная #3: hopbyhop fooling + multisplit.',
    category: 'alt',
    args: [
      '--wf-tcp=80,443,2053,2083,2087,2096,8443',
      '--wf-udp=443,19294-19344,50000-50100',
      '--filter-udp=443',
      '--hostlist={LISTS}list-general.txt',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      '--filter-udp=19294-19344,50000-50100',
      '--filter-l7=discord,stun',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--new',
      '--filter-tcp=80,443,2053,2083,2087,2096,8443',
      '--hostlist={LISTS}list-general.txt',
      '--hostlist={LISTS}list-google.txt',
      '--dpi-desync=fake,multisplit',
      '--dpi-desync-split-pos=1,host+1',
      '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=hopbyhop',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin'
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // 7. FAKE TLS AUTO ALT — рандомный TLS с другими параметрами
  // ─────────────────────────────────────────────────────────────
  {
    id: 'fake_tls_auto_alt',
    name: 'FAKE TLS AUTO ALT',
    description: 'Модифицированная FAKE TLS AUTO с альтернативными параметрами.',
    category: 'fake_tls',
    args: [
      '--wf-tcp=80,443,2053,2083,2087,2096,8443',
      '--wf-udp=443,19294-19344,50000-50100',
      '--filter-udp=443',
      '--hostlist={LISTS}list-general.txt',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=11',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      '--filter-udp=19294-19344,50000-50100',
      '--filter-l7=discord,stun',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--new',
      '--filter-tcp=80,443,2053,2083,2087,2096,8443',
      '--hostlist={LISTS}list-general.txt',
      '--hostlist={LISTS}list-google.txt',
      '--dpi-desync=fake,multidisorder',
      '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=11',
      '--dpi-desync-fooling=badseq,ts',
      '--dpi-desync-fake-tls=0x00000000',
      '--dpi-desync-fake-tls-mod=rnd,rndsni,dupsid'
    ]
  }
]

/** Получить стратегию по ID */
export function getStrategyById(id: string): Strategy | undefined {
  return STRATEGIES.find(s => s.id === id)
}
