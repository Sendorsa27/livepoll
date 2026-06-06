import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeEmail, normalizeHouse } from '@/utils/normalize'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()

    // 1. Authenticate user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // 2. Validate admin permissions case-insensitively
    const adminEmailNormalized = normalizeEmail(user.email)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => normalizeEmail(e))
    if (!adminEmails.includes(adminEmailNormalized)) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    // 3. Query all votes with student details using admin client
    const adminSupabase = createAdminClient()
    const { data: votes, error } = await adminSupabase
      .from('votes')
      .select(`
        voted_house,
        created_at,
        students (
          email,
          house
        )
      `)
      .order('created_at', { ascending: true })

    if (error || !votes) {
      return new NextResponse(error?.message || 'Failed to fetch votes', { status: 500 })
    }

    // 4. Construct CSV contents with normalized values
    const csvHeaders = 'Student Email,Student House,Voted House,Voting Timestamp\n'
    
    interface VoteRow {
      voted_house: string
      created_at: string
      students: {
        email: string
        house: string
      } | null
    }

    const csvRows = (votes as unknown as VoteRow[])
      .map((row) => {
        const student = row.students
        const email = student?.email ? normalizeEmail(student.email) : ''
        const studentHouse = student?.house ? normalizeHouse(student.house) : ''
        const votedHouse = row.voted_house ? normalizeHouse(row.voted_house) : ''
        const timestamp = row.created_at || ''
        return `${email},${studentHouse},${votedHouse},${timestamp}`
      })
      .join('\n')

    const csvContent = csvHeaders + csvRows

    // 5. Generate filename format: votes_export_YYYY_MM_DD_HH_MM.csv
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const year = now.getFullYear()
    const month = pad(now.getMonth() + 1)
    const day = pad(now.getDate())
    const hours = pad(now.getHours())
    const minutes = pad(now.getMinutes())
    const filename = `votes_export_${year}_${month}_${day}_${hours}_${minutes}.csv`

    // Log the CSV Export action
    const { createAdminClient: createLoggerClient } = await import('@/utils/supabase/admin')
    const loggerSupabase = createLoggerClient()
    await loggerSupabase.from('admin_logs').insert({
      admin_email: adminEmailNormalized,
      action: 'CSV Exported'
    })

    // 6. Return downloadable CSV stream
    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (err: unknown) {
    return new NextResponse(err instanceof Error ? err.message : 'Internal Server Error', { status: 500 })
  }
}
