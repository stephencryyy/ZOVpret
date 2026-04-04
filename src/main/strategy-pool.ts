// ============================================================================
// ZOVpret — Пул стратегий (из Flowseal/zapret-discord-youtube v1.9.7b)
// ============================================================================
// Каждая стратегия — это набор аргументов для winws.exe, извлечённый из
// реальных .bat файлов Flowseal. Стратегии упорядочены по вероятности успеха.
// При Smart Start они перебираются последовательно.
//
// Всего 20 стратегий — полный паритет с upstream Flowseal.
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

// ─── Общие блоки, переиспользуемые во всех стратегиях ────────────────────
const WF_PORTS = '--wf-tcp=80,443,2053,2083,2087,2096,8443'
const WF_UDP = '--wf-udp=443,19294-19344,50000-50100'

// UDP QUIC hostlist-фильтр (общий для всех)
const UDP_QUIC_BLOCK = [
  '--filter-udp=443',
  '--hostlist={LISTS}list-general.txt',
  '--hostlist={LISTS}list-general-user.txt',
  '--hostlist-exclude={LISTS}list-exclude.txt',
  '--hostlist-exclude={LISTS}list-exclude-user.txt',
  '--ipset-exclude={LISTS}ipset-exclude.txt',
  '--ipset-exclude={LISTS}ipset-exclude-user.txt',
]

// Discord UDP block
const DISCORD_UDP_BLOCK = [
  '--filter-udp=19294-19344,50000-50100',
  '--filter-l7=discord,stun',
  '--dpi-desync=fake',
  '--dpi-desync-repeats=6',
]

// Hostlist args для general TCP
const HOSTLIST_GENERAL_TCP = [
  '--hostlist={LISTS}list-general.txt',
  '--hostlist={LISTS}list-general-user.txt',
  '--hostlist-exclude={LISTS}list-exclude.txt',
  '--hostlist-exclude={LISTS}list-exclude-user.txt',
  '--ipset-exclude={LISTS}ipset-exclude.txt',
  '--ipset-exclude={LISTS}ipset-exclude-user.txt',
]

/**
 * Все 20 стратегий из Flowseal v1.9.7b.
 * {BIN} и {LISTS} — плейсхолдеры, заменяемые на реальные пути при запуске.
 */
export const STRATEGIES: Strategy[] = [
  // ═══════════════════════════════════════════════════════════════
  // 1. GENERAL — Основная (multisplit + seqovl)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'general',
    name: 'General',
    description: 'Основная: multisplit + sequence overlap. Работает у большинства.',
    category: 'general',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=multisplit', '--dpi-desync-split-seqovl=681',
      '--dpi-desync-split-pos=1',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt',
      '--ip-id=zero',
      '--dpi-desync=multisplit', '--dpi-desync-split-seqovl=681',
      '--dpi-desync-split-pos=1',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=80,443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=multisplit', '--dpi-desync-split-seqovl=568',
      '--dpi-desync-split-pos=1',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_4pda_to.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 2. ALT — fake+fakedsplit + ts fooling
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'alt',
    name: 'ALT',
    description: 'Альтернативная: fake+fakedsplit с TS fooling.',
    category: 'alt',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=fake,fakedsplit', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-fakedsplit-pattern=0x00',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt',
      '--ip-id=zero',
      '--dpi-desync=fake,fakedsplit', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-fakedsplit-pattern=0x00',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=80,443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake,fakedsplit', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-fakedsplit-pattern=0x00',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-http={BIN}tls_clienthello_max_ru.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 3. ALT 2 — multidisorder + md5sig
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'alt2',
    name: 'ALT 2',
    description: 'multidisorder + md5sig fooling.',
    category: 'alt',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=80,443,2053,2083,2087,2096,8443',
      '--hostlist={LISTS}list-general.txt', '--hostlist={LISTS}list-google.txt',
      '--dpi-desync=fake,multidisorder', '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=8', '--dpi-desync-fooling=md5sig',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 4. ALT 3 — hopbyhop + multisplit
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'alt3',
    name: 'ALT 3',
    description: 'hopbyhop fooling + multisplit.',
    category: 'alt',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=80,443,2053,2083,2087,2096,8443',
      '--hostlist={LISTS}list-general.txt', '--hostlist={LISTS}list-google.txt',
      '--dpi-desync=fake,multisplit', '--dpi-desync-split-pos=1,host+1',
      '--dpi-desync-repeats=6', '--dpi-desync-fooling=hopbyhop',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 5. ALT 4 — badseq + increment=1000
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'alt4',
    name: 'ALT 4',
    description: 'fake,multisplit + badseq increment=1000.',
    category: 'alt',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=fake,multisplit', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=badseq', '--dpi-desync-badseq-increment=1000',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt', '--ip-id=zero',
      '--dpi-desync=fake,multisplit', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=badseq', '--dpi-desync-badseq-increment=1000',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=80,443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake,multisplit', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=badseq', '--dpi-desync-badseq-increment=1000',
      '--dpi-desync-fake-tls={BIN}stun.bin',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-http={BIN}tls_clienthello_max_ru.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 6. ALT 5 — syndata,multidisorder (минималистичная)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'alt5',
    name: 'ALT 5',
    description: 'Минималистичная: syndata + multidisorder. Нет .bin зависимостей для TCP.',
    category: 'alt',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-l3=ipv4',
      '--filter-tcp=80,443,2053,2083,2087,2096,8443',
      '--ipset-exclude={LISTS}ipset-exclude.txt',
      '--ipset-exclude={LISTS}ipset-exclude-user.txt',
      '--dpi-desync=syndata,multidisorder'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 7. ALT 6 — fake + md5sig
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'alt6',
    name: 'ALT 6',
    description: 'fake + md5sig fooling. Другой подход к обходу.',
    category: 'alt',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=80,443,2053,2083,2087,2096,8443',
      '--hostlist={LISTS}list-general.txt', '--hostlist={LISTS}list-google.txt',
      '--dpi-desync=fake,multidisorder', '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=8', '--dpi-desync-fooling=md5sig',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 8. ALT 7 — fake + hopbyhop
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'alt7',
    name: 'ALT 7',
    description: 'fake + hopbyhop fooling.',
    category: 'alt',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=80,443,2053,2083,2087,2096,8443',
      '--hostlist={LISTS}list-general.txt', '--hostlist={LISTS}list-google.txt',
      '--dpi-desync=fake,multisplit', '--dpi-desync-split-pos=1,host+1',
      '--dpi-desync-repeats=6', '--dpi-desync-fooling=hopbyhop',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 9. ALT 8 — fake + ts + badseq-increment=10000000
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'alt8',
    name: 'ALT 8',
    description: 'fake + ts fooling, badseq-increment=10M.',
    category: 'alt',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts', '--dpi-desync-badseq-increment=10000000',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt', '--ip-id=zero',
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts', '--dpi-desync-badseq-increment=10000000',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=80,443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts', '--dpi-desync-badseq-increment=10000000',
      '--dpi-desync-fake-tls={BIN}stun.bin',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-http={BIN}tls_clienthello_max_ru.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 10. ALT 9 — fake + multidisorder + badseq
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'alt9',
    name: 'ALT 9',
    description: 'fake,multidisorder + badseq.',
    category: 'alt',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=fake,multidisorder', '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=8', '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt', '--ip-id=zero',
      '--dpi-desync=fake,multidisorder', '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=8', '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=80,443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake,multidisorder', '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=8', '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls={BIN}stun.bin',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-http={BIN}tls_clienthello_max_ru.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 11. ALT 10 — fake + ts + stun.bin pattern
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'alt10',
    name: 'ALT 10',
    description: 'fake + ts fooling с stun.bin паттерном.',
    category: 'alt',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-tls-mod=none',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt', '--ip-id=zero',
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=80,443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts',
      '--dpi-desync-fake-tls={BIN}stun.bin',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_4pda_to.bin',
      '--dpi-desync-fake-http={BIN}tls_clienthello_max_ru.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 12. ALT 11 — multisplit + seqovl=681 + ts (гибрид)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'alt11',
    name: 'ALT 11',
    description: 'Гибрид General+ALT: multisplit + seqovl=681 + ts fooling.',
    category: 'alt',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=11',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=fake,multisplit', '--dpi-desync-split-seqovl=681',
      '--dpi-desync-split-pos=1', '--dpi-desync-fooling=ts',
      '--dpi-desync-repeats=8',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt', '--ip-id=zero',
      '--dpi-desync=fake,multisplit', '--dpi-desync-split-seqovl=681',
      '--dpi-desync-split-pos=1', '--dpi-desync-fooling=ts',
      '--dpi-desync-repeats=8',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=80,443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake,multisplit', '--dpi-desync-split-seqovl=664',
      '--dpi-desync-split-pos=1', '--dpi-desync-fooling=ts',
      '--dpi-desync-repeats=8',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_max_ru.bin',
      '--dpi-desync-fake-tls={BIN}stun.bin',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_max_ru.bin',
      '--dpi-desync-fake-http={BIN}tls_clienthello_max_ru.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 13. FAKE TLS AUTO — rnd TLS + badseq + multidisorder
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'fake_tls_auto',
    name: 'FAKE TLS AUTO',
    description: 'Рандомные фейковые TLS + badseq + multidisorder.',
    category: 'fake_tls',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=11',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=fake,multidisorder', '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=11', '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls=0x00000000',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt', '--ip-id=zero',
      '--dpi-desync=fake,multidisorder', '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=11', '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls=0x00000000',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com',
      '--new',
      '--filter-tcp=80,443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake,multidisorder', '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=11', '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls=0x00000000',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com',
      '--dpi-desync-fake-http={BIN}tls_clienthello_max_ru.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 14. FAKE TLS AUTO ALT — rnd + rndsni + dupsid
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'fake_tls_auto_alt',
    name: 'FAKE TLS AUTO ALT',
    description: 'rnd + rndsni + dupsid (без фиксированного sni).',
    category: 'fake_tls',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=11',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=80,443,2053,2083,2087,2096,8443',
      '--hostlist={LISTS}list-general.txt', '--hostlist={LISTS}list-google.txt',
      '--dpi-desync=fake,multidisorder', '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=11', '--dpi-desync-fooling=badseq,ts',
      '--dpi-desync-fake-tls=0x00000000',
      '--dpi-desync-fake-tls-mod=rnd,rndsni,dupsid'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 15. FAKE TLS AUTO ALT2 — multisplit + seqovl=681 + badseq-increment=10M
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'fake_tls_auto_alt2',
    name: 'FAKE TLS AUTO ALT2',
    description: 'multisplit + seqovl + badseq-increment=10M + rnd,dupsid,sni.',
    category: 'fake_tls',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=11',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=fake,multisplit', '--dpi-desync-split-seqovl=681',
      '--dpi-desync-split-pos=1', '--dpi-desync-fooling=badseq',
      '--dpi-desync-badseq-increment=10000000', '--dpi-desync-repeats=8',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt', '--ip-id=zero',
      '--dpi-desync=fake,multisplit', '--dpi-desync-split-seqovl=681',
      '--dpi-desync-split-pos=1', '--dpi-desync-fooling=badseq',
      '--dpi-desync-badseq-increment=10000000', '--dpi-desync-repeats=8',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com',
      '--new',
      '--filter-tcp=80,443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake,multisplit', '--dpi-desync-split-seqovl=681',
      '--dpi-desync-split-pos=1', '--dpi-desync-fooling=badseq',
      '--dpi-desync-badseq-increment=10000000', '--dpi-desync-repeats=8',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com',
      '--dpi-desync-fake-http={BIN}tls_clienthello_max_ru.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 16. FAKE TLS AUTO ALT3 — multisplit + seqovl=681 + ts + rnd,dupsid,sni
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'fake_tls_auto_alt3',
    name: 'FAKE TLS AUTO ALT3',
    description: 'multisplit + seqovl + ts fooling + rnd,dupsid,sni. Хорош для Instagram.',
    category: 'fake_tls',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=11',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=fake,multisplit', '--dpi-desync-split-seqovl=681',
      '--dpi-desync-split-pos=1', '--dpi-desync-fooling=ts',
      '--dpi-desync-repeats=8',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt', '--ip-id=zero',
      '--dpi-desync=fake,multisplit', '--dpi-desync-split-seqovl=681',
      '--dpi-desync-split-pos=1', '--dpi-desync-fooling=ts',
      '--dpi-desync-repeats=8',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com',
      '--new',
      '--filter-tcp=80,443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake,multisplit', '--dpi-desync-split-seqovl=681',
      '--dpi-desync-split-pos=1', '--dpi-desync-fooling=ts',
      '--dpi-desync-repeats=8',
      '--dpi-desync-split-seqovl-pattern={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com',
      '--dpi-desync-fake-http={BIN}tls_clienthello_max_ru.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 17. SIMPLE FAKE — только fake пакеты
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'simple_fake',
    name: 'SIMPLE FAKE',
    description: 'Только fake пакеты + badseq. Минимальное воздействие.',
    category: 'simple_fake',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=80,443,2053,2083,2087,2096,8443',
      '--hostlist={LISTS}list-general.txt', '--hostlist={LISTS}list-google.txt',
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 18. SIMPLE FAKE ALT — badseq + increment=2
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'simple_fake_alt',
    name: 'SIMPLE FAKE ALT',
    description: 'fake + badseq-increment=2. Точечный сдвиг sequence.',
    category: 'simple_fake',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=badseq', '--dpi-desync-badseq-increment=2',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt', '--ip-id=zero',
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=badseq', '--dpi-desync-badseq-increment=2',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=80,443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=badseq', '--dpi-desync-badseq-increment=2',
      '--dpi-desync-fake-tls={BIN}stun.bin',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-http={BIN}tls_clienthello_max_ru.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 19. SIMPLE FAKE ALT2 — ts + badseq-increment=10M
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'simple_fake_alt2',
    name: 'SIMPLE FAKE ALT2',
    description: 'fake + ts fooling + badseq-increment=10M.',
    category: 'simple_fake',
    args: [
      WF_PORTS, WF_UDP,
      ...UDP_QUIC_BLOCK,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      ...DISCORD_UDP_BLOCK,
      '--new',
      '--filter-tcp=2053,2083,2087,2096,8443',
      '--hostlist-domains=discord.media',
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts', '--dpi-desync-badseq-increment=10000000',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=443',
      '--hostlist={LISTS}list-google.txt', '--ip-id=zero',
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts', '--dpi-desync-badseq-increment=10000000',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--new',
      '--filter-tcp=80,443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake', '--dpi-desync-repeats=6',
      '--dpi-desync-fooling=ts', '--dpi-desync-badseq-increment=10000000',
      '--dpi-desync-fake-tls={BIN}stun.bin',
      '--dpi-desync-fake-tls={BIN}tls_clienthello_www_google_com.bin',
      '--dpi-desync-fake-http={BIN}tls_clienthello_max_ru.bin'
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 20. Instagram / Meta — Оптимизировано под Instagram/Facebook
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'instagram_meta',
    name: 'Instagram / Meta',
    description: 'Для Instagram, Facebook, WhatsApp. Fake TLS + rndsni + autottl.',
    category: 'general',
    args: [
      '--wf-tcp=80,443', '--wf-udp=443',
      '--filter-udp=443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake', '--dpi-desync-repeats=11',
      '--dpi-desync-fake-quic={BIN}quic_initial_www_google_com.bin',
      '--new',
      '--filter-tcp=443',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake,multidisorder', '--dpi-desync-split-pos=1,midsld',
      '--dpi-desync-repeats=11', '--dpi-desync-fooling=badseq',
      '--dpi-desync-fake-tls=0x00000000',
      '--dpi-desync-fake-tls-mod=rnd,rndsni,dupsid',
      '--dpi-desync-autottl=2',
      '--new',
      '--filter-tcp=80',
      ...HOSTLIST_GENERAL_TCP,
      '--dpi-desync=fake,multidisorder', '--dpi-desync-split-pos=1,host+1',
      '--dpi-desync-repeats=6', '--dpi-desync-fooling=badseq'
    ]
  }
]

/** Получить стратегию по ID */
export function getStrategyById(id: string): Strategy | undefined {
  return STRATEGIES.find(s => s.id === id)
}
