'use client'

import { useState, useRef } from 'react'
import { castVote, signOutUser } from './actions'
import { normalizeHouse } from '@/utils/normalize'
import { LogOut, CheckCircle2, Lock, Loader2, Sparkles, User, Info } from 'lucide-react'

interface Student {
  email: string
  house: string
}

interface VotingContainerProps {
  student: Student
  votedHouse: string | null
  votingLocked: boolean
}

interface HouseConfig {
  name: string
  hex: string
  accentClass: string
  bgClass: string
  glowClass: string
  hoverClass: string
  textColor: string
}

const HOUSE_DATA: Record<string, HouseConfig> = {
  Phoenix: {
    name: 'Phoenix',
    hex: '#EF4444',
    accentClass: 'border-red-500/30 focus-within:border-red-500/60',
    bgClass: 'bg-red-600',
    glowClass: 'shadow-red-500/10 hover:shadow-red-500/20 hover:border-red-500/50',
    hoverClass: 'hover:bg-red-950/10',
    textColor: 'text-red-500',
  },
  Leo: {
    name: 'Leo',
    hex: '#FACC15',
    accentClass: 'border-yellow-500/30 focus-within:border-yellow-500/60',
    bgClass: 'bg-yellow-500',
    glowClass: 'shadow-yellow-500/10 hover:shadow-yellow-500/20 hover:border-yellow-500/50',
    hoverClass: 'hover:bg-yellow-950/10',
    textColor: 'text-yellow-400',
  },
  Kong: {
    name: 'Kong',
    hex: '#3B82F6',
    accentClass: 'border-blue-500/30 focus-within:border-blue-500/60',
    bgClass: 'bg-blue-600',
    glowClass: 'shadow-blue-500/10 hover:shadow-blue-500/20 hover:border-blue-500/50',
    hoverClass: 'hover:bg-blue-950/10',
    textColor: 'text-blue-500',
  },
  Tuskers: {
    name: 'Tuskers',
    hex: '#22C55E',
    accentClass: 'border-green-500/30 focus-within:border-green-500/60',
    bgClass: 'bg-green-600',
    glowClass: 'shadow-green-500/10 hover:shadow-green-500/20 hover:border-green-500/50',
    hoverClass: 'hover:bg-green-950/10',
    textColor: 'text-green-500',
  },
}

export default function VotingContainer({
  student,
  votedHouse,
  votingLocked,
}: VotingContainerProps) {
  const [selectedHouse, setSelectedHouse] = useState<string | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmittingVote, setIsSubmittingVote] = useState(false)
  const [selectionLocked, setSelectionLocked] = useState(false)
  
  const [prevVotedHouse, setPrevVotedHouse] = useState<string | null>(votedHouse)
  const [localVotedHouse, setLocalVotedHouse] = useState<string | null>(votedHouse)

  const isSubmittingRef = useRef(false)

  const isSubmitting = isSubmittingVote
  const hasVoted = !!localVotedHouse

  // Sync state if prop changes from parent
  if (votedHouse !== prevVotedHouse) {
    setPrevVotedHouse(votedHouse)
    setLocalVotedHouse(votedHouse)
    setSelectionLocked(votedHouse ? true : false)
  }

  // Normalize student house name for comparison
  const normalizedStudentHouse = normalizeHouse(student.house)

  // Filter out the student's own house from selection list
  const eligibleHouses = Object.keys(HOUSE_DATA).filter(
    (h) => h.toLowerCase() !== normalizedStudentHouse.toLowerCase()
  )

  const handleVoteSubmit = async () => {
    if (isSubmitting || hasVoted) return
    if (!selectedHouse || isSubmittingRef.current) return

    setErrorMessage(null)
    setIsSubmittingVote(true)
    isSubmittingRef.current = true
    try {
      const res = await castVote(selectedHouse)
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to register vote. Please try again.')
        setShowConfirmModal(false)
        isSubmittingRef.current = false
        setIsSubmittingVote(false)
      } else {
        setShowConfirmModal(false)
        setLocalVotedHouse(selectedHouse)
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.')
      setShowConfirmModal(false)
      isSubmittingRef.current = false
      setIsSubmittingVote(false)
    }
  }

  // --- VIEW 1: Already Voted Success Screen ---
  if (localVotedHouse) {
    const houseConfig = HOUSE_DATA[normalizeHouse(localVotedHouse)] || HOUSE_DATA.Phoenix

    return (
      <div className="relative min-h-screen flex flex-col bg-slate-950 text-white overflow-hidden font-sans">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

        {/* Top Header */}
        <header className="border-b border-slate-900 bg-slate-950/60 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span className="font-extrabold tracking-wider bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent text-sm md:text-base">
              SST VOTING
            </span>
          </div>
          <button
            onClick={() => signOutUser()}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 px-4 py-3 min-h-[44px] rounded-lg transition border border-slate-800 font-semibold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </header>

        {/* Success Card container */}
        <main className="flex-1 flex items-center justify-center p-6 z-10">
          <div className="w-full max-w-md bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-xl p-6 sm:p-8 shadow-2xl text-center space-y-8">
            <div className="mx-auto w-12 h-12 bg-green-950/40 border border-green-500/30 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-black text-white tracking-tight">
                ✓ Vote Successfully Recorded
              </h1>
              <p className="text-slate-400 text-sm">
                Thank you for participating.
              </p>
            </div>

            {/* Display the voted house card */}
            <div
              className="p-5 rounded-lg border bg-slate-950/80 border-slate-800/80 transition-all duration-500 relative overflow-hidden"
              style={{
                boxShadow: `0 10px 30px -10px ${houseConfig.hex}22`,
                borderColor: `${houseConfig.hex}40`,
              }}
            >
              <div
                className="absolute -right-8 -top-8 w-20 h-20 rounded-full blur-2xl opacity-10"
                style={{ backgroundColor: houseConfig.hex }}
              />

              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">
                Your Selection
              </span>
              <span className={`text-2xl font-black tracking-tight ${houseConfig.textColor}`}>
                {houseConfig.name.toUpperCase()}
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              Your vote has been securely submitted and cannot be changed.
            </p>
          </div>
        </main>
      </div>
    )
  }

  // --- VIEW 2: Voting Locked / Ended Screen ---
  if (votingLocked) {
    return (
      <div className="relative min-h-screen flex flex-col bg-slate-950 text-white overflow-hidden font-sans">
        <header className="border-b border-slate-900 bg-slate-950/60 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span className="font-extrabold tracking-wider bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent text-sm md:text-base">
              SST VOTING
            </span>
          </div>
          <button
            onClick={() => signOutUser()}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 px-4 py-3 min-h-[44px] rounded-lg transition border border-slate-800 font-semibold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-6 z-10">
          <div className="w-full max-w-md bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-xl p-8 shadow-2xl text-center space-y-6">
            <div className="mx-auto w-12 h-12 bg-red-950/40 border border-red-500/30 rounded-xl flex items-center justify-center">
              <Lock className="w-6 h-6 text-red-400" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-black text-white tracking-tight">
                Voting is Closed
              </h1>
              <p className="text-slate-400 text-sm leading-relaxed">
                Voting has ended for this event. No new votes can be submitted. The event coordinator has closed this session.
              </p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // --- VIEW 3: Active Voting Screen ---
  return (
    <div className="relative min-h-screen flex flex-col bg-slate-950 text-white overflow-hidden pb-12 font-sans">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/60 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <span className="font-extrabold tracking-wider bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent text-sm md:text-base">
            SST VOTING
          </span>
        </div>
        <button
          onClick={() => {
            if (isSubmitting || hasVoted) return
            signOutUser()
          }}
          disabled={isSubmitting || hasVoted}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 px-4 py-3 min-h-[44px] rounded-lg transition border border-slate-800 font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </header>

      {/* Main Form Content */}
      <main className={`flex-1 max-w-xl w-full mx-auto px-4 pt-8 md:pt-12 space-y-8 z-10 ${isSubmitting ? 'pointer-events-none opacity-60' : ''}`}>
        {/* Student details card */}
        <div className="bg-slate-900/30 backdrop-blur-md border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900/60 rounded-lg flex items-center justify-center text-slate-300 border border-slate-800">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-200 truncate max-w-[200px] sm:max-w-xs">{student.email}</h3>
              <p className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold">Voter Profile</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold">Your House:</span>
            <span
              className="px-3 py-1 text-xs font-bold rounded-md border bg-slate-950"
              style={{
                color: HOUSE_DATA[normalizedStudentHouse]?.hex || '#fff',
                borderColor: `${HOUSE_DATA[normalizedStudentHouse]?.hex}40` || '#fff',
              }}
            >
              {normalizedStudentHouse.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Voting Header */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black md:text-3xl tracking-tight text-white uppercase">
            Choose a House
          </h2>
          <p className="text-slate-400 text-xs md:text-sm max-w-md mx-auto flex items-center justify-center gap-1.5 font-medium">
            <Info className="w-4 h-4 text-indigo-400 inline shrink-0" />
            You cannot vote for your own house (<span className="font-semibold text-slate-200">{normalizedStudentHouse}</span>).
          </p>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="bg-red-950/40 border border-red-500/30 text-red-200 text-xs rounded-lg p-4 text-center">
            {errorMessage}
          </div>
        )}

        {/* Houses grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {eligibleHouses.map((houseKey) => {
            const h = HOUSE_DATA[houseKey]
            const isSelected = selectedHouse === houseKey

            return (
              <button
                key={houseKey}
                onClick={() => {
                  if (isSubmitting || hasVoted || selectionLocked) return
                  setSelectedHouse(houseKey)
                  setSelectionLocked(true)
                }}
                disabled={isSubmitting || hasVoted || selectionLocked}
                className={`group text-left p-5 rounded-lg border bg-slate-900/10 backdrop-blur-md transition-all duration-300 relative flex flex-col justify-between h-36 ${
                  isSelected
                    ? `border-opacity-100`
                    : `border-slate-800/80 hover:border-slate-700/80 hover:bg-slate-900/20`
                } ${
                  (isSubmitting || hasVoted)
                    ? 'cursor-not-allowed pointer-events-none opacity-60'
                    : selectionLocked
                      ? isSelected
                        ? 'cursor-default'
                        : 'pointer-events-none opacity-50 cursor-not-allowed'
                      : 'cursor-pointer'
                }`}
                style={
                  isSelected
                    ? {
                        boxShadow: `0 0 20px -5px ${h.hex}33`,
                        borderColor: h.hex,
                      }
                    : {}
                }
              >
                <div className="flex justify-between items-start w-full">
                  <div>
                    <span className={`text-xl font-bold tracking-tight block ${h.textColor}`}>
                      {h.name}
                    </span>
                    <span className="text-slate-500 text-[10px] uppercase tracking-wider block mt-0.5 font-semibold">
                      {h.name === 'Phoenix' ? 'Red House' : h.name === 'Leo' ? 'Yellow House' : h.name === 'Kong' ? 'Blue House' : 'Green House'}
                    </span>
                  </div>
                </div>

                <div className="w-full flex items-center justify-between mt-4">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${
                    isSelected 
                      ? 'bg-slate-900 text-white border-slate-700' 
                      : 'bg-transparent text-slate-400 border-slate-800 group-hover:border-slate-700'
                  }`}>
                    {isSelected ? '✓ Selected' : 'Select'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Change Selection Button */}
        {selectionLocked && !hasVoted && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => {
                if (isSubmitting || hasVoted) return
                setSelectionLocked(false)
                setSelectedHouse(null)
              }}
              disabled={isSubmitting || hasVoted}
              className={`text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-850 px-5 py-3 min-h-[44px] rounded-lg transition border border-slate-800/80 flex items-center justify-center gap-1.5 cursor-pointer ${(isSubmitting || hasVoted) ? 'cursor-not-allowed pointer-events-none opacity-60' : ''}`}
            >
              Change Selection
            </button>
          </div>
        )}

        {/* Submit button */}
        <div className="pt-4">
          <button
            onClick={() => {
              if (isSubmitting || hasVoted) return
              setShowConfirmModal(true)
            }}
            disabled={isSubmitting || hasVoted || !selectedHouse}
            className={`w-full py-3.5 px-6 min-h-[44px] rounded-lg font-bold tracking-wider text-xs uppercase transition-all duration-300 transform active:scale-98 shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
              selectedHouse
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/20'
                : 'bg-slate-900 text-slate-600 border border-slate-800/80 cursor-not-allowed'
            } ${(isSubmitting || hasVoted) ? 'cursor-not-allowed pointer-events-none opacity-60' : ''}`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting Vote... Please wait.
              </>
            ) : (
              'Cast Vote'
            )}
          </button>
        </div>
      </main>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedHouse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-6 backdrop-blur-md">
            <h3 className="text-lg font-bold text-white text-center uppercase tracking-wide">Confirm Selection</h3>
            
            <p className="text-slate-400 text-sm text-center leading-relaxed">
              You are voting for:{' '}
              <span className={`font-black ${HOUSE_DATA[selectedHouse].textColor}`}>
                {selectedHouse.toUpperCase()}
              </span>
            </p>

            <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-lg text-center">
              <p className="text-[10px] uppercase tracking-wider text-red-400 font-extrabold">
                This vote is permanent and cannot be changed.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  if (isSubmitting || hasVoted) return
                  setShowConfirmModal(false)
                }}
                disabled={isSubmitting || hasVoted}
                className={`w-full sm:flex-1 py-3 px-4 min-h-[44px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs uppercase tracking-wider transition cursor-pointer flex items-center justify-center order-2 sm:order-1 ${isSubmitting ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (isSubmitting || hasVoted) return
                  handleVoteSubmit()
                }}
                disabled={isSubmitting || hasVoted}
                className={`w-full sm:flex-1 py-3 px-4 min-h-[44px] rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs uppercase tracking-wider transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-1.5 cursor-pointer order-1 sm:order-2 ${isSubmitting ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Submitting Vote... Please wait.
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global submit freeze blocker overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-slate-900/80 border border-slate-800/80 p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 text-center max-w-xs w-full backdrop-blur-md">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-white">Submitting Vote... Please wait.</p>
              <p className="text-[10px] text-slate-500">Please do not refresh or close this page.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
