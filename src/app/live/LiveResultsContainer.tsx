'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'
import { Maximize2, Minimize2, WifiOff, Vote } from 'lucide-react'
import QRCode from 'qrcode'

interface HouseVote {
  house: string
  count: number
}

interface Settings {
  voting_locked: boolean
}

interface LiveResultsContainerProps {
  initialVotes: HouseVote[]
  initialSettings: Settings
  presentationMode: boolean
}

interface HouseTheme {
  name: string
  hex: string
  bgGradient: string
  glowClass: string
  textColor: string
  barColor: string
  emoji: string
}

const HOUSE_THEMES: Record<string, HouseTheme> = {
  Phoenix: {
    name: 'Phoenix',
    hex: '#EF4444',
    bgGradient: 'from-red-950/20 to-slate-900/60',
    glowClass: 'shadow-red-500/10 border-red-500/20',
    textColor: 'text-red-500',
    barColor: 'bg-red-500',
    emoji: '🟥',
  },
  Leo: {
    name: 'Leo',
    hex: '#FACC15',
    bgGradient: 'from-yellow-950/10 to-slate-900/60',
    glowClass: 'shadow-yellow-500/10 border-yellow-500/20',
    textColor: 'text-yellow-400',
    barColor: 'bg-yellow-500',
    emoji: '🟨',
  },
  Kong: {
    name: 'Kong',
    hex: '#3B82F6',
    bgGradient: 'from-blue-950/20 to-slate-900/60',
    glowClass: 'shadow-blue-500/10 border-blue-500/20',
    textColor: 'text-blue-500',
    barColor: 'bg-blue-500',
    emoji: '🟦',
  },
  Tuskers: {
    name: 'Tuskers',
    hex: '#22C55E',
    bgGradient: 'from-green-950/20 to-slate-900/60',
    glowClass: 'shadow-green-500/10 border-green-500/20',
    textColor: 'text-green-500',
    barColor: 'bg-green-500',
    emoji: '🟩',
  },
}

export default function LiveResultsContainer({
  initialVotes,
  initialSettings,
  presentationMode = false,
}: LiveResultsContainerProps) {
  const defaultVotes = [
    { house: 'Phoenix', count: 0 },
    { house: 'Leo', count: 0 },
    { house: 'Kong', count: 0 },
    { house: 'Tuskers', count: 0 },
  ]

  const mergedVotes = defaultVotes.map((dv) => {
    const found = initialVotes.find((iv) => iv.house.toLowerCase() === dv.house.toLowerCase())
    return found ? { house: found.house, count: found.count } : dv
  })

  const [votes, setVotes] = useState<HouseVote[]>(mergedVotes)
  const [votingLocked, setVotingLocked] = useState(initialSettings.voting_locked)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected')
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const supabase = createClient()

  // 1. Generate QR Code dynamically pointing to the domain origin
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.host
      const protocol = window.location.protocol
      const voteUrl = `${protocol}//${host}`
      QRCode.toDataURL(voteUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: '#0f172a', // Slate-900
          light: '#ffffff'
        }
      }).then((url) => {
        setQrCodeUrl(url)
      }).catch(err => {
        console.error('Error generating QR code:', err)
      })
    }
  }, [])

  const connectionStatusRef = useRef(connectionStatus)
  useEffect(() => {
    connectionStatusRef.current = connectionStatus
  }, [connectionStatus])

  // 2. Resilient Realtime Supabase Channel Subscriptions with automatic reconnect triggers
  useEffect(() => {
    let votesChannel: RealtimeChannel | null = null
    let settingsChannel: RealtimeChannel | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null

    const subscribeRealtime = () => {
      if (votesChannel) supabase.removeChannel(votesChannel)
      if (settingsChannel) supabase.removeChannel(settingsChannel)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)

      const uniqueId = Date.now()

      votesChannel = supabase
        .channel(`house-votes-${uniqueId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'house_votes',
          },
          (payload) => {
            if (payload.new && 'house' in payload.new && 'count' in payload.new) {
              const newHouse = payload.new.house as string
              const newCount = Number(payload.new.count)
              setVotes((prevVotes) =>
                prevVotes.map((v) =>
                  v.house.toLowerCase() === newHouse.toLowerCase() ? { ...v, count: newCount } : v
                )
              )
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setConnectionStatus('connected')
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            setConnectionStatus('disconnected')
            // Attempt auto-reconnection in 3 seconds
            reconnectTimeout = setTimeout(subscribeRealtime, 3000)
          }
        })

      settingsChannel = supabase
        .channel(`settings-${uniqueId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'settings',
          },
          (payload) => {
            if (payload.new && 'voting_locked' in payload.new) {
              setVotingLocked(payload.new.voting_locked)
            }
          }
        )
        .subscribe()
    }

    subscribeRealtime()

    // 3. Fallback poll every 10s if disconnected
    const interval = setInterval(async () => {
      if (connectionStatusRef.current !== 'connected') {
        const { data: votesData } = await supabase.from('house_votes').select('*')
        if (votesData) {
          setVotes((prev) =>
            prev.map((v) => {
              const found = votesData.find((d) => d.house.toLowerCase() === v.house.toLowerCase())
              return found ? { ...v, count: found.count } : v
            })
          )
        }
        
        const { data: settingsData } = await supabase.from('settings').select('*').eq('id', 1).single()
        if (settingsData) {
          setVotingLocked(settingsData.voting_locked)
        }
      }
    }, 10000)

    // Re-sync instantly when browser window/tab gains focus
    const handleFocus = async () => {
      const { data: votesData } = await supabase.from('house_votes').select('*')
      if (votesData) {
        setVotes((prev) =>
          prev.map((v) => {
            const found = votesData.find((d) => d.house.toLowerCase() === v.house.toLowerCase())
            return found ? { ...v, count: found.count } : v
          })
        )
      }
      const { data: settingsData } = await supabase.from('settings').select('*').eq('id', 1).single()
      if (settingsData) {
        setVotingLocked(settingsData.voting_locked)
      }
      subscribeRealtime()
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      if (votesChannel) supabase.removeChannel(votesChannel)
      if (settingsChannel) supabase.removeChannel(settingsChannel)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [supabase])

  const toggleFullscreen = () => {
    if (!containerRef.current) return

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true)
      }).catch((err) => {
        console.error('Error enabling fullscreen:', err)
      })
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false)
      })
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const totalVotes = votes.reduce((sum, v) => sum + v.count, 0)

  // Sort by count for standings dynamically
  const sortedVotes = [...votes].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count
    }
    return a.house.localeCompare(b.house)
  })

  // Log outputs to satisfy data audit checks
  console.log('house_votes', votes)
  console.log('settings', { voting_locked: votingLocked })

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none font-sans relative"
    >
      {/* Glow backgrounds */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

      {/* TOP HEADER */}
      <header className="px-10 py-6 flex flex-col md:flex-row items-center justify-between border-b border-slate-900 bg-slate-950/60 backdrop-blur-md z-10 relative gap-4">
        {/* Left: Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 border border-slate-800/80 rounded-lg flex items-center justify-center text-slate-300 shrink-0">
            <Vote className="w-5 h-5 text-slate-300" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white">
              SST House Voting
            </h1>
            <p className="text-xs text-slate-400 font-medium">Real-Time Leaderboard</p>
          </div>
        </div>

        {/* Center: Total Votes */}
        <div className="flex flex-col items-center justify-center text-center">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-extrabold block">
            Total Votes Cast
          </span>
          <span className="text-4xl md:text-5xl font-black bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
            {totalVotes}
          </span>
        </div>

        {/* Right: Status Info */}
        <div className="flex items-center gap-3">
          {connectionStatus === 'disconnected' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-extrabold border bg-red-950/20 border-red-500/20 text-red-400 animate-pulse">
              <WifiOff className="w-3.5 h-3.5" />
              Disconnected
            </div>
          )}

          <div
            className={`px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase border ${
              !votingLocked
                ? 'bg-green-950/20 border-green-500/30 text-green-400'
                : 'bg-red-950/20 border-red-500/30 text-red-500'
            }`}
          >
            VOTING {!votingLocked ? 'OPEN' : 'CLOSED'}
          </div>

          {!presentationMode && (
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              Fullscreen
            </button>
          )}
        </div>
      </header>

      {/* TWO COLUMN GRID CONTENT */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative min-h-0">
        
        {/* LEFT SIDE (Leaderboard - dynamic remainder width) */}
        <main className="flex-1 flex flex-col justify-center max-w-4xl w-full mx-auto px-10 py-8 space-y-6 overflow-y-auto">
          <div className="flex-1 flex flex-col justify-center space-y-5">
            {sortedVotes.map((voteData, index) => {
              const theme = HOUSE_THEMES[voteData.house] || HOUSE_THEMES.Phoenix
              const percentage = totalVotes > 0 ? Math.round((voteData.count / totalVotes) * 100) : 0

              return (
                <div
                  key={voteData.house}
                  className="relative flex items-center justify-between p-6 rounded-xl border bg-slate-900/10 border-slate-850 transition-all duration-500 overflow-hidden"
                  style={{
                    boxShadow: `0 4px 20px -5px ${theme.hex}10`,
                  }}
                >
                  {/* Left House Color Bar Indicator */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2.5"
                    style={{ backgroundColor: theme.hex }}
                  />

                  {/* Rank, House Name, Emoji */}
                  <div className="flex items-center gap-4 relative z-10 shrink-0">
                    <span className="text-3xl font-black text-slate-500 w-10">
                      #{index + 1}
                    </span>
                    <span className="text-2xl filter drop-shadow-[0_0_8px_rgba(255,255,255,0.1)]">
                      {theme.emoji}
                    </span>
                    <span className={`text-2xl md:text-3xl font-black tracking-tight ${theme.textColor}`}>
                      {theme.name.toUpperCase()}
                    </span>
                  </div>

                  {/* Animated Progress Bar */}
                  <div className="flex-1 mx-8 hidden sm:block relative z-10">
                    <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                      <div
                        className={`h-full ${theme.barColor} rounded-full transition-all duration-1000 ease-out`}
                        style={{
                          width: `${percentage}%`,
                          boxShadow: `0 0 12px ${theme.hex}88`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Vote count & Percentage */}
                  <div className="flex items-center gap-6 relative z-10 text-right shrink-0">
                    <div className="flex flex-col">
                      <span className="text-2xl md:text-3xl font-black text-white">
                        {voteData.count}
                      </span>
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                        Votes
                      </span>
                    </div>
                    <div className="w-16">
                      <span className="text-2xl md:text-3xl font-black text-indigo-400">
                        {percentage}%
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </main>

        {/* RIGHT SIDE (QR Section - fixed width, approx 35-40%) */}
        <div className="w-full lg:w-[420px] shrink-0 bg-slate-900/20 backdrop-blur-md border-t lg:border-t-0 lg:border-l border-slate-900 flex flex-col items-center justify-center p-8 lg:p-12 space-y-8 z-10 text-center">
          {qrCodeUrl ? (
            <div className="bg-white p-5 rounded-3xl shadow-2xl border border-slate-800 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={qrCodeUrl} 
                alt="Scan to Vote QR Code" 
                className="w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] object-contain"
              />
            </div>
          ) : (
            <div className="w-[320px] h-[320px] bg-slate-950/60 rounded-3xl animate-pulse border border-slate-800 flex items-center justify-center text-slate-600 text-sm">
              Generating QR Code...
            </div>
          )}
          <div className="space-y-3">
            <h2 className="text-3xl md:text-4xl font-black tracking-widest text-indigo-400 uppercase">
              SCAN TO VOTE
            </h2>
            <p className="text-xl md:text-2xl font-bold tracking-tight text-slate-300">
              vote.sst.scaler.com
            </p>
          </div>
        </div>
      </div>

      {/* Footer (Only rendered when NOT in presentation mode) */}
      {!presentationMode && (
        <footer className="px-10 py-6 text-center border-t border-slate-900/60 bg-slate-950/40 text-[10px] uppercase tracking-wider text-slate-600 font-bold z-10">
          Scan the QR code to vote • Authentic Scaler accounts only • One vote per student
        </footer>
      )}
    </div>
  )
}
