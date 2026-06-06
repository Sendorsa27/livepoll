'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  toggleVotingLock,
  importStudentsCSV,
  resetVotesForTesting,
  signOutUser
} from '../actions'
import { createClient } from '@/utils/supabase/client'
import { VOTING_URL } from '@/utils/constants'
import {
  Lock,
  Unlock,
  Download,
  Upload,
  ExternalLink,
  QrCode,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Loader2,
  FileSpreadsheet,
  ClipboardList,
} from 'lucide-react'
import QRCode from 'qrcode'
import Link from 'next/link'

interface HouseVote {
  house: string
  count: number
}

interface AdminLog {
  id: string | number
  admin_email: string
  action: string
  created_at: string
}

interface Settings {
  voting_locked: boolean
  results_visible: boolean
}

interface SkippedRowDetail {
  row: number
  email: string
  house: string
  reason: string
}

interface AdminDashboardContainerProps {
  totalStudents: number
  initialHouseVotes: HouseVote[]
  initialSettings: Settings
  initialLogs: AdminLog[]
  adminEmail: string
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return ''
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

const HOUSE_THEMES: Record<string, { textColor: string; hex: string; bgClass: string }> = {
  Phoenix: { textColor: 'text-red-500', hex: '#EF4444', bgClass: 'bg-red-500/10 border-red-500/20' },
  Leo: { textColor: 'text-yellow-400', hex: '#FACC15', bgClass: 'bg-yellow-500/10 border-yellow-500/20' },
  Kong: { textColor: 'text-blue-500', hex: '#3B82F6', bgClass: 'bg-blue-500/10 border-blue-500/20' },
  Tuskers: { textColor: 'text-green-500', hex: '#22C55E', bgClass: 'bg-green-500/10 border-green-500/20' },
}

export default function AdminDashboardContainer({
  totalStudents: initialTotalStudents,
  initialHouseVotes,
  initialSettings,
  initialLogs,
  adminEmail,
}: AdminDashboardContainerProps) {
  const [totalStudents, setTotalStudents] = useState(initialTotalStudents)
  const [houseVotes, setHouseVotes] = useState<HouseVote[]>(initialHouseVotes)
  const [votingLocked, setVotingLocked] = useState(initialSettings.voting_locked)
  const [logs, setLogs] = useState<AdminLog[]>(initialLogs)

  // CSV import states
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvPreviewText, setCsvPreviewText] = useState('')
  const [importSummary, setImportSummary] = useState<{
    imported: number
    updated: number
    skipped: number
    skippedRows: SkippedRowDetail[]
    detectedEmailCol?: string
    detectedHouseCol?: string
  } | null>(null)

  // QR Code states
  const [qrCodeUrl, setQrCodeUrl] = useState('')

  // Reset states
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  const [isLockPending, startLockTransition] = useTransition()
  const [isImportPending, startImportTransition] = useTransition()
  const [isResetPending, startResetTransition] = useTransition()

  // Disables buttons if any operation is running
  const isAnyActionPending = isLockPending || isImportPending || isResetPending

  const supabase = createClient()

  // Realtime subscription setup
  useEffect(() => {
    // 1. Subscribe to house votes
    const votesChannel = supabase
      .channel('admin:house_votes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'house_votes' },
        (payload) => {
          if (payload.new && 'house' in payload.new && 'count' in payload.new) {
            const updatedHouse = payload.new.house as string
            const newCount = Number(payload.new.count)

            setHouseVotes((prev) =>
              prev.map((v) =>
                v.house.toLowerCase() === updatedHouse.toLowerCase() ? { ...v, count: newCount } : v
              )
            )
          }
        }
      )
      .subscribe()

    // 2. Subscribe to settings
    const settingsChannel = supabase
      .channel('admin:settings')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'settings' },
        (payload) => {
          if (payload.new && 'voting_locked' in payload.new) {
            setVotingLocked(payload.new.voting_locked)
          }
        }
      )
      .subscribe()

    // 3. Subscribe to admin audit logs
    const logsChannel = supabase
      .channel('admin:admin_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_logs' },
        (payload) => {
          if (payload.new) {
            setLogs((prev) => [payload.new as AdminLog, ...prev].slice(0, 50))
            if (payload.new.action.startsWith('CSV Imported') || payload.new.action.startsWith('Election Reset')) {
              // Refresh total students
              supabase.from('students').select('*', { count: 'exact', head: true }).then(({ count }) => {
                if (count !== null) setTotalStudents(count)
              })
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(votesChannel)
      supabase.removeChannel(settingsChannel)
      supabase.removeChannel(logsChannel)
    }
  }, [supabase])

  // Realtime Resilience: Re-sync state immediately when tab becomes focused or visible
  useEffect(() => {
    const handleTabReFocus = () => {
      // Re-sync votes
      supabase.from('house_votes').select('*').then(({ data }) => {
        if (data) {
          setHouseVotes((prev) =>
            prev.map((v) => {
              const found = data.find((d) => d.house.toLowerCase() === v.house.toLowerCase())
              return found ? { house: found.house, count: found.count } : v
            })
          )
        }
      })

      // Re-sync settings
      supabase.from('settings').select('*').eq('id', 1).single().then(({ data }) => {
        if (data) {
          setVotingLocked(data.voting_locked)
        }
      })

      // Re-sync students count
      supabase.from('students').select('*', { count: 'exact', head: true }).then(({ count }) => {
        if (count !== null) setTotalStudents(count)
      })
    };

    window.addEventListener('focus', handleTabReFocus)
    document.addEventListener('visibilitychange', handleTabReFocus)
    return () => {
      window.removeEventListener('focus', handleTabReFocus)
      document.removeEventListener('visibilitychange', handleTabReFocus)
    }
  }, [supabase])

  // Generate QR Code pointing to the Vercel URL constant
  useEffect(() => {
    QRCode.toDataURL(
      VOTING_URL,
      {
        width: 400,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      },
      (err, url) => {
        if (!err) setQrCodeUrl(url)
      }
    )
  }, [])

  // Derive total votes cast dynamically
  const totalVotes = houseVotes.reduce((sum, v) => sum + v.count, 0)

  const handleToggleLock = () => {
    setErrorMessage(null)
    startLockTransition(async () => {
      const newLockState = !votingLocked
      const res = await toggleVotingLock(newLockState)
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to update lock state.')
      }
    })
  }

  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setCsvFile(file)
    setImportSummary(null)
    setErrorMessage(null)

    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        setCsvPreviewText(text)
      }
      reader.readAsText(file)
    } else {
      setCsvPreviewText('')
    }
  }

  const handleCSVImportSubmit = () => {
    if (!csvPreviewText) return

    setErrorMessage(null)
    setImportSummary(null)
    startImportTransition(async () => {
      const res = await importStudentsCSV(csvPreviewText)
      if (res.success && res.imported !== undefined) {
        setImportSummary({
          imported: res.imported,
          updated: res.updated || 0,
          skipped: res.skipped || 0,
          skippedRows: res.skippedRows || [],
          detectedEmailCol: res.detectedEmailCol,
          detectedHouseCol: res.detectedHouseCol,
        })
        setCsvFile(null)
        setCsvPreviewText('')
      } else {
        setErrorMessage(res.error || 'Failed to import CSV dataset.')
      }
    })
  }

  const handleDownloadSampleCSV = () => {
    const headers = 'email,house\n'
    const rows = [
      'student1@sst.scaler.com,Phoenix',
      'student2@sst.scaler.com,Leo',
      'student3@sst.scaler.com,Kong',
      'student4@sst.scaler.com,Tuskers',
    ].join('\n')

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', 'sample_students.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleResetVotes = () => {
    if (resetConfirmText !== 'RESET') {
      setErrorMessage("Please type 'RESET' to confirm election purge.")
      return
    }

    setErrorMessage(null)
    startResetTransition(async () => {
      const res = await resetVotesForTesting(resetConfirmText)
      if (res.success) {
        setHouseVotes((prev) => prev.map((v) => ({ ...v, count: 0 })))
        setVotingLocked(false)
        setShowResetConfirm(false)
        setResetConfirmText('')
      } else {
        setErrorMessage(res.error || 'Failed to reset election data.')
      }
    })
  }

  const participationPercentage =
    totalStudents > 0 ? Math.round((totalVotes / totalStudents) * 100) : 0

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-900 bg-slate-950/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <div className="bg-red-500/20 text-red-500 p-1.5 rounded-lg border border-red-500/30">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight">SST ELECTION PANEL</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">Management Terminal</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden md:inline text-xs text-slate-400 font-medium">
            Console User: <span className="text-white font-semibold">{adminEmail}</span>
          </span>
          <button
            onClick={() => signOutUser()}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-xl transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Terminal View */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        
        {/* Error Alerts */}
        {errorMessage && (
          <div className="bg-red-950/50 border border-red-500/30 text-red-200 text-sm rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5 animate-bounce" />
            <div>
              <h4 className="font-bold">Execution Error</h4>
              <p className="text-xs text-red-300/95 mt-1">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* 1. Status Dashboard & Statistics Summary Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Card: Voting Status */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-xl p-5 shadow-xl flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Voting Status</span>
            <span className={`text-xl font-black mt-2 inline-flex items-center gap-1.5 ${votingLocked ? 'text-red-400' : 'text-green-400'}`}>
              {votingLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              {votingLocked ? 'CLOSED' : 'OPEN'}
            </span>
          </div>

          {/* Card: Eligible Students */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-xl p-5 shadow-xl flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Eligible Students</span>
            <span className="text-2xl font-black mt-2 text-white">{totalStudents}</span>
          </div>

          {/* Card: Votes Cast */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-xl p-5 shadow-xl flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Votes Cast</span>
            <span className="text-2xl font-black mt-2 text-white">{totalVotes}</span>
          </div>

          {/* Card: Participation Rate */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-xl p-5 shadow-xl flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Participation</span>
            <span className="text-2xl font-black mt-2 text-white">{participationPercentage}%</span>
          </div>
        </section>

        {/* 2. Operations and Logs Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Controls & Operations Panels (Left + Center Columns) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Session Controller Panel */}
            <div className="bg-slate-900/30 border border-slate-800/60 rounded-xl p-6 space-y-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Lock className="w-5 h-5 text-red-500" />
                Session Controls
              </h2>

              <div className="max-w-md">
                
                {/* Locking Switch */}
                <div className="p-5 rounded-xl border border-slate-850 bg-slate-950/60 flex flex-col justify-between h-40">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-slate-500 block mb-1">
                      Voting System Lock
                    </span>
                    <span className="text-xs text-slate-400 leading-normal">
                      Open or conclude the student voting terminal.
                    </span>
                  </div>

                  <button
                    onClick={handleToggleLock}
                    disabled={isAnyActionPending}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      votingLocked
                        ? 'bg-green-600 hover:bg-green-500 text-white'
                        : 'bg-red-600 hover:bg-red-500 text-white'
                    }`}
                  >
                    {isLockPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : votingLocked ? (
                      <>
                        <Unlock className="w-4 h-4" />
                        Unlock Voting
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        Lock Voting
                      </>
                    )}
                  </button>
                </div>

              </div>
            </div>

            {/* CSV Import / Roster panel */}
            <div className="bg-slate-900/30 border border-slate-800/60 rounded-xl p-6 space-y-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <FileSpreadsheet className="w-5 h-5 text-green-500" />
                Voter Roster Configuration
              </h2>

              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-4 bg-slate-950/60 rounded-xl border border-slate-850">
                <div className="space-y-1 text-center sm:text-left">
                  <h4 className="text-sm font-bold text-slate-200">Import Student CSV</h4>
                  <p className="text-xs text-slate-500 leading-normal max-w-sm">
                    Upload roster: <span className="font-semibold text-slate-400">email,house</span>. Existing records will update house assignments; invalid lines will be flagged.
                  </p>
                </div>
                <button
                  onClick={handleDownloadSampleCSV}
                  disabled={isAnyActionPending}
                  className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-xs tracking-wider uppercase rounded-xl transition whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Download Sample CSV
                </button>
              </div>

              {/* Upload box */}
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/20 rounded-xl transition relative">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCSVFileChange}
                    disabled={isAnyActionPending}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <Upload className="w-8 h-8 text-slate-500 mb-2" />
                  <span className="text-xs font-bold text-slate-300">
                    {csvFile ? csvFile.name : 'Select student CSV roster file'}
                  </span>
                  <span className="text-[10px] text-slate-600 mt-1">.csv format only</span>
                </div>

                {/* Import summary with Detailed Skips */}
                {importSummary && (
                  <div className="bg-slate-950/80 border border-slate-850 p-5 rounded-xl space-y-4">
                    <div className="text-center space-y-1 border-b border-slate-900 pb-3">
                      <p className="text-sm font-bold text-green-400">Import Batch Finished</p>
                      <p className="text-xs text-slate-400">
                        Imported: <span className="font-bold text-white">{importSummary.imported}</span> • Updated: <span className="font-bold text-white">{importSummary.updated}</span> • Skipped: <span className="font-bold text-white">{importSummary.skipped}</span>
                      </p>
                      {importSummary.detectedEmailCol && importSummary.detectedHouseCol && (
                        <p className="text-[10px] text-slate-500 pt-1">
                          Detected Columns — Email: <span className="font-mono text-slate-300 font-semibold">{importSummary.detectedEmailCol}</span> | House: <span className="font-mono text-slate-300 font-semibold">{importSummary.detectedHouseCol}</span>
                        </p>
                      )}
                    </div>

                    {/* Skipped detail list */}
                    {importSummary.skippedRows.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block">
                          Skipped Row Details (First 20)
                        </span>
                        <div className="max-h-[160px] overflow-y-auto space-y-1.5 border border-slate-900 p-2.5 rounded-xl text-xs bg-slate-950/40 scrollbar-thin">
                          {importSummary.skippedRows.map((sr, idx) => (
                            <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-900/40 last:border-0 text-slate-300">
                              <span className="font-mono text-slate-500">Row {sr.row}:</span>
                              <span className="truncate max-w-[150px] font-medium text-slate-400" title={sr.email || '[empty]'}>
                                {sr.email || '[empty]'}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[9px] bg-red-950/40 text-red-400 border border-red-900/30">
                                {sr.reason}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {csvPreviewText && (
                  <button
                    onClick={handleCSVImportSubmit}
                    disabled={isAnyActionPending}
                    className="w-full py-3.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isImportPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Importing Roster...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Upload and Import Students
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Live Standings Panel */}
            <div className="bg-slate-900/30 border border-slate-800/60 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-white">Live Aggregations</h2>
                <div className="flex gap-2">
                  <a
                    href="/admin/export"
                    className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-[10px] tracking-wider uppercase rounded-lg transition flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </a>
                  
                  <Link
                    href="/live"
                    target="_blank"
                    className="py-1.5 px-3 bg-blue-900 hover:bg-blue-800 border border-blue-800 text-blue-300 font-bold text-[10px] tracking-wider uppercase rounded-lg transition flex items-center gap-1 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Live Dashboard
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {houseVotes.map((h) => {
                  const theme = HOUSE_THEMES[h.house] || HOUSE_THEMES.Phoenix
                  return (
                    <div
                      key={h.house}
                      className={`p-4 rounded-xl border bg-slate-950/40 ${theme.bgClass}`}
                    >
                      <span className={`text-xs font-bold uppercase tracking-wider block ${theme.textColor}`}>
                        {h.house}
                      </span>
                      <span className="text-3xl font-black block mt-2 text-white">{h.count}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">votes</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Dry Run / Election Reset Utility */}
            <div className="bg-slate-900/30 border border-red-950/20 rounded-xl p-6 border-dashed space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-red-400">Dry Run & Reset Controls</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Clears all votes, resets house counters to zero, and resets settings locks to default (voting unlocked). Action is recorded in audit log.
                  </p>
                </div>
              </div>

              {!showResetConfirm ? (
                <button
                  onClick={() => setShowResetConfirm(true)}
                  disabled={isAnyActionPending}
                  className="py-2.5 px-4 bg-red-950/30 hover:bg-red-950/50 text-red-400 hover:text-red-300 border border-red-500/20 rounded-xl font-bold text-xs tracking-wider uppercase transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Reset Election
                </button>
              ) : (
                <div className="bg-slate-950/60 border border-red-900/40 p-4 rounded-xl space-y-3">
                  <p className="text-xs text-red-400 font-bold leading-normal">
                    CRITICAL: This permanently purges all voter submissions. This cannot be undone.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Type 'RESET' to confirm"
                      value={resetConfirmText}
                      onChange={(e) => setResetConfirmText(e.target.value)}
                      disabled={isResetPending}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500/40 flex-1"
                    />
                    <button
                      onClick={handleResetVotes}
                      disabled={isResetPending || resetConfirmText !== 'RESET'}
                      className="py-2 px-4 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isResetPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Truncate
                    </button>
                    <button
                      onClick={() => {
                        setShowResetConfirm(false)
                        setResetConfirmText('')
                      }}
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Right Column: QR Code generator & Audit Logs */}
          <div className="space-y-6">
            
            {/* QR Card */}
            <div className="bg-slate-900/30 border border-slate-800/60 rounded-xl p-6 text-center flex flex-col items-center">
              <div className="w-full text-left">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-purple-400" />
                  Student QR Code
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-normal">
                  Points to: <span className="text-slate-400 font-semibold">{VOTING_URL}</span>.
                </p>
              </div>

              <div className="w-full max-w-[240px] aspect-square bg-white rounded-xl p-4 shadow-xl border border-slate-850 flex items-center justify-center relative group overflow-hidden mt-4">
                {qrCodeUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={qrCodeUrl}
                    alt="Voting Link QR Code"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                    Generating QR
                  </div>
                )}
              </div>

              {qrCodeUrl && (
                <a
                  href={qrCodeUrl}
                  download="sst-voting-qr.png"
                  className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-200 hover:text-white rounded-xl text-center font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition active:scale-98 mt-4 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download PNG QR
                </a>
              )}
            </div>

            {/* Audit Logs Board */}
            <div className="bg-slate-900/30 border border-slate-800/60 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <ClipboardList className="w-5 h-5 text-blue-500" />
                Audit Logs
              </h2>

              <div className="max-h-[300px] overflow-y-auto space-y-2.5 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
                {logs.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-600 font-medium">
                    No actions logged.
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl space-y-1.5"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs font-bold text-slate-200 break-all">{log.admin_email}</span>
                        <span className="text-[9px] text-slate-500 shrink-0" suppressHydrationWarning>
                          {formatTime(log.created_at)}
                        </span>
                      </div>
                      <p className="text-[11px] text-blue-400 font-medium leading-normal break-words">{log.action}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>

      </main>
    </div>
  )
}
