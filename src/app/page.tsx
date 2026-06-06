import { createClient } from '@/utils/supabase/server'
import { normalizeEmail } from '@/utils/normalize'
import { signInWithGoogle, signOutUser } from './actions'
import VotingContainer from './VotingContainer'
import { LogOut, Vote, AlertTriangle, ShieldAlert } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const supabase = await createClient()

  // 1. Fetch user session
  const { data: { user } } = await supabase.auth.getUser()

  // --- RENDER 1: Not Authenticated (Login Screen) ---
  if (!user) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-slate-950 text-white overflow-hidden px-4">
        {/* Glow ambient background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(239,68,68,0.1),transparent_50%)]" />
        
        <div className="relative z-10 w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-xl p-8 shadow-2xl text-center space-y-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-blue-600 to-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Vote className="w-8 h-8 text-white animate-pulse" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-white to-red-400 bg-clip-text text-transparent">
              SST House Voting
            </h1>
            <p className="text-slate-400 text-sm">
              Cast your vote for the ultimate house championship. Authenticate to proceed.
            </p>
          </div>

          <form action={signInWithGoogle}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 font-semibold py-3.5 px-5 min-h-[44px] rounded-xl transition duration-300 transform active:scale-98 shadow-md"
            >
              {/* Google SVG Icon */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69a5.74 5.74 0 0 1-2.48 3.77v3.08h3.99c2.33-2.15 3.68-5.32 3.68-8.7z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.99-3.08c-1.12.75-2.55 1.19-3.97 1.19-3.06 0-5.65-2.07-6.58-4.86H1.32v3.19A11.99 11.99 0 0 0 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.42 14.34A7.17 7.17 0 0 1 5 12c0-.82.14-1.61.42-2.34V6.47H1.32A11.98 11.98 0 0 0 0 12c0 1.96.48 3.82 1.32 5.53l4.1-3.19z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A11.99 11.99 0 0 0 1.32 6.47l4.1 3.19c.93-2.79 3.52-4.86 6.58-4.86z"
                />
              </svg>
              Sign in with SST Account
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800 text-xs text-slate-500">
            Only emails ending with <span className="text-slate-400 font-semibold">@sst.scaler.com</span> are allowed to vote.
          </div>
        </div>
      </div>
    )
  }

  // Normalize email
  const email = normalizeEmail(user.email || '')

  // --- RENDER 2: Invalid Email Domain ---
  if (!email.endsWith('@sst.scaler.com')) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
        <div className="relative z-10 w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-red-900/30 rounded-xl p-8 shadow-2xl text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-red-950/50 border border-red-500/30 rounded-xl flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-red-400">Invalid Domain</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              The account <span className="font-semibold text-slate-300">{email}</span> is not allowed. You must use your official SST email address ending with <span className="font-semibold text-white">@sst.scaler.com</span>.
            </p>
          </div>

          <form action={signOutUser}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold py-3 px-5 min-h-[44px] rounded-xl transition duration-300 transform active:scale-98"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </form>
        </div>
      </div>
    )
  }

  // --- 2. Query Student Database ---
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('*')
    .eq('email', email)
    .single()

  // --- RENDER 3: Student Not In Database (Not Eligible) ---
  if (studentError || !student) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
        <div className="relative z-10 w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-yellow-900/30 rounded-xl p-8 shadow-2xl text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-yellow-950/50 border border-yellow-500/30 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-yellow-400">Access Denied</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              You are signed in as <span className="font-semibold text-slate-300">{email}</span>, but you are not eligible to vote. Please contact the administrator if you believe this is a mistake.
            </p>
          </div>

          <form action={signOutUser}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-5 min-h-[44px] rounded-xl transition duration-300 transform active:scale-98"
            >
              <LogOut className="w-5 h-5" />
              Sign Out & Try Another Account
            </button>
          </form>
        </div>
      </div>
    )
  }

  // --- 3. Check if Vote Already Cast (Query by student_email using Admin Client to bypass RLS) ---
  const { createAdminClient } = await import('@/utils/supabase/admin')
  const adminSupabase = createAdminClient()
  const { data: vote } = await adminSupabase
    .from('votes')
    .select('*')
    .eq('student_email', email)
    .single()

  const votedHouse = vote?.voted_house || null

  // --- 4. Check Voting Settings ---
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single()

  const votingLocked = settings?.voting_locked ?? false

  // --- RENDER 4: Display Voting Interface ---
  return (
    <VotingContainer
      student={{ email: student.email, house: student.house }}
      votedHouse={votedHouse}
      votingLocked={votingLocked}
    />
  )
}
