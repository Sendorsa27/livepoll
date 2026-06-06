import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import AdminDashboardContainer from './AdminDashboardContainer'
import { ShieldAlert, LogOut } from 'lucide-react'
import { signOutUser } from '../actions'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createClient()

  // 1. Authenticate user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/')
  }

  // 2. Validate email is in ADMIN_EMAILS
  const email = user.email || ''
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',')

  if (!adminEmails.includes(email)) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
        <div className="relative z-10 w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-red-900/30 rounded-xl p-8 shadow-2xl text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-red-950/50 border border-red-500/30 rounded-xl flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-red-400">Admin Access Denied</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              You are signed in as <span className="font-semibold text-slate-300">{email}</span>, which does not have administrative access. Please contact the system owner if you require permissions.
            </p>
          </div>

          <form action={signOutUser}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-5 rounded-xl transition duration-300 transform active:scale-98"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </form>
        </div>
      </div>
    )
  }

  // 3. Fetch summary metrics using service role client (bypasses RLS limits)
  const adminSupabase = createAdminClient()

  // Fetch count of eligible students
  const { count: totalStudents } = await adminSupabase
    .from('students')
    .select('*', { count: 'exact', head: true })


  // Fetch house votes breakdown
  const { data: houseVotes } = await adminSupabase
    .from('house_votes')
    .select('*')

  // Fetch settings
  const { data: settings } = await adminSupabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single()

  // Fetch audit logs
  const { data: logs } = await adminSupabase
    .from('admin_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  const defaultSettings = { voting_locked: false, results_visible: false }

  return (
    <AdminDashboardContainer
      totalStudents={totalStudents || 0}
      initialHouseVotes={houseVotes || []}
      initialSettings={settings || defaultSettings}
      initialLogs={logs || []}
      adminEmail={email}
    />
  )
}
