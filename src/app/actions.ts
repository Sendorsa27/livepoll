'use server'

import { createClient } from '@/utils/supabase/server'
import { normalizeEmail, normalizeHouse } from '@/utils/normalize'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Helper to record administrative actions in the audit logs
 */
async function logAdminAction(adminEmail: string, action: string) {
  const { createAdminClient } = await import('@/utils/supabase/admin')
  const adminSupabase = createAdminClient()
  await adminSupabase.from('admin_logs').insert({
    admin_email: adminEmail,
    action: action
  })
}

/**
 * Initiates the Google OAuth sign-in flow
 */
export async function signInWithGoogle() {
  const supabase = await createClient()
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  
  const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  const redirectUrl = `${protocol}://${host}/auth/callback`

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        hd: 'sst.scaler.com',
        prompt: 'select_account',
      }
    }
  })

  if (error) {
    throw new Error(error.message)
  }

  if (data.url) {
    redirect(data.url)
  }
}

/**
 * Signs the current user out
 */
export async function signOutUser() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

/**
 * Casts a vote after normalizing inputs and verifying eligibility
 */
export async function castVote(votedHouse: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'You must be signed in to vote.' }
    }

    // Normalize user email
    const email = normalizeEmail(user.email || '')
    if (!email.endsWith('@sst.scaler.com')) {
      await supabase.auth.signOut()
      return { success: false, error: 'Only @sst.scaler.com emails are allowed to vote.' }
    }

    // Normalize and check voted house
    const house = normalizeHouse(votedHouse)
    const validHouses = ['Phoenix', 'Leo', 'Kong', 'Tuskers']
    if (!validHouses.includes(house)) {
      return { success: false, error: 'Invalid house selected.' }
    }

    // Eligible student check using normalized email
    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('*')
      .eq('email', email)
      .single()

    if (studentErr || !student) {
      return { success: false, error: 'You are not eligible to vote.' }
    }

    // Voting lock status validation
    const { data: settings, error: settingsErr } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (settingsErr || !settings || settings.voting_locked) {
      return { success: false, error: 'Voting has ended.' }
    }

    // Self-voting validation
    if (normalizeHouse(student.house) === house) {
      return { success: false, error: 'You cannot vote for your own house.' }
    }

    // Cast vote using normalized values
    const { error: insertErr } = await supabase
      .from('votes')
      .insert({
        student_email: email,
        voted_house: house
      })

    if (insertErr) {
      if (insertErr.code === '23505') {
        return { success: false, error: 'Your vote has already been recorded.' }
      }
      return { success: false, error: insertErr.message }
    }

    revalidatePath('/')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'An unexpected error occurred.' }
  }
}

/**
 * Locks or unlocks voting (Admin only)
 */
export async function toggleVotingLock(locked: boolean) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return { success: false, error: 'Unauthorized.' }
    }

    const adminEmailNormalized = normalizeEmail(user.email)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => normalizeEmail(e))
    if (!adminEmails.includes(adminEmailNormalized)) {
      return { success: false, error: 'Forbidden.' }
    }

    const { error } = await supabase
      .from('settings')
      .update({ voting_locked: locked, updated_at: new Date().toISOString() })
      .eq('id', 1)

    if (error) {
      return { success: false, error: error.message }
    }

    // Record in audit logs
    await logAdminAction(adminEmailNormalized, locked ? 'Voting Locked' : 'Voting Unlocked')

    revalidatePath('/')
    revalidatePath('/admin')
    revalidatePath('/live')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to toggle voting lock.' }
  }
}

/**
 * Reveals or hides voting results on the live screen (Admin only)
 */
export async function toggleResultsVisibility(visible: boolean) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return { success: false, error: 'Unauthorized.' }
    }

    const adminEmailNormalized = normalizeEmail(user.email)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => normalizeEmail(e))
    if (!adminEmails.includes(adminEmailNormalized)) {
      return { success: false, error: 'Forbidden.' }
    }

    const { error } = await supabase
      .from('settings')
      .update({ results_visible: visible, updated_at: new Date().toISOString() })
      .eq('id', 1)

    if (error) {
      return { success: false, error: error.message }
    }

    // Record in audit logs
    await logAdminAction(adminEmailNormalized, visible ? 'Results Revealed' : 'Results Hidden')

    revalidatePath('/admin')
    revalidatePath('/live')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to toggle results visibility.' }
  }
}

interface SkippedRow {
  row: number
  email: string
  house: string
  reason: string
}

/**
 * Parses and imports student emails & houses from CSV data (Admin only)
 * Follows UPSERT behavior and details skips.
 */
export async function importStudentsCSV(csvDataString: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return { success: false, error: 'Unauthorized.' }
    }

    const adminEmailNormalized = normalizeEmail(user.email)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => normalizeEmail(e))
    if (!adminEmails.includes(adminEmailNormalized)) {
      return { success: false, error: 'Forbidden.' }
    }

    const lines = csvDataString.split(/\r?\n/)
    const validRows: { email: string; house: string }[] = []
    const skippedRows: SkippedRow[] = []
    const processedEmailsInBatch = new Set<string>()

    const validHouses = ['Phoenix', 'Leo', 'Kong', 'Tuskers']

    // Detect headers from the first non-empty line
    let headerLineIndex = -1
    let emailColIndex = -1
    let houseColIndex = -1
    let detectedEmailColName = ''
    let detectedHouseColName = ''

    const emailHeaderNames = ['sst email', 'email', 'email address']
    const houseHeaderNames = ['house', 'house name']

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line) {
        headerLineIndex = i
        const headersList = line.split(',').map(h => h.trim())
        for (let j = 0; j < headersList.length; j++) {
          const hName = headersList[j]
          const normH = hName.toLowerCase()
          if (emailColIndex === -1 && emailHeaderNames.includes(normH)) {
            emailColIndex = j
            detectedEmailColName = hName
          }
          if (houseColIndex === -1 && houseHeaderNames.includes(normH)) {
            houseColIndex = j
            detectedHouseColName = hName
          }
        }
        break
      }
    }

    const hasDetectedHeaders = emailColIndex !== -1 && houseColIndex !== -1

    if (!hasDetectedHeaders) {
      // Fallback: assume column 0 is email, column 1 is house
      emailColIndex = 0
      houseColIndex = 1
      detectedEmailColName = 'Default (Col 0)'
      detectedHouseColName = 'Default (Col 1)'
      // In fallback mode, do not skip any lines (the first line is data)
      headerLineIndex = -1
    }

    // 1. Initial line parsing
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const rowNum = i + 1

      if (i === headerLineIndex) {
        continue
      }

      if (!line) {
        // Skip silent if it's trailing line, otherwise log as malformed
        if (i < lines.length - 1) {
          skippedRows.push({ row: rowNum, email: '', house: '', reason: 'Malformed row' })
        }
        continue
      }

      const parts = line.split(',')
      const rawEmail = parts[emailColIndex]?.trim() || ''
      const rawHouse = parts[houseColIndex]?.trim() || ''

      if (!rawEmail) {
        skippedRows.push({ row: rowNum, email: '', house: rawHouse, reason: 'Missing email' })
        continue
      }

      const email = normalizeEmail(rawEmail)
      const house = normalizeHouse(rawHouse)

      if (!email.endsWith('@sst.scaler.com')) {
        skippedRows.push({ row: rowNum, email, house, reason: 'Invalid domain' })
        continue
      }

      if (!rawHouse) {
        skippedRows.push({ row: rowNum, email, house: '', reason: 'Invalid house' })
        continue
      }

      if (!validHouses.includes(house)) {
        skippedRows.push({ row: rowNum, email, house, reason: 'Invalid house' })
        continue
      }

      if (processedEmailsInBatch.has(email)) {
        skippedRows.push({ row: rowNum, email, house, reason: 'Duplicate row' })
        continue
      }

      processedEmailsInBatch.add(email)
      validRows.push({ email, house })
    }

    let importedCount = 0
    let updatedCount = 0

    // 2. Fetch existing and determine UPSERT status
    if (validRows.length > 0) {
      const { createAdminClient } = await import('@/utils/supabase/admin')
      const adminSupabase = createAdminClient()

      const batchEmails = validRows.map(r => r.email)
      
      const { data: existing } = await adminSupabase
         .from('students')
         .select('email, house')
         .in('email', batchEmails)

      const existingMap = new Map(existing?.map(s => [normalizeEmail(s.email), normalizeHouse(s.house)]) || [])
      const studentsToUpsert: { email: string; house: string }[] = []

      validRows.forEach((row, index) => {
        const existingHouse = existingMap.get(row.email)

        if (existingHouse !== undefined) {
          if (existingHouse !== row.house) {
            updatedCount++
            studentsToUpsert.push(row)
          } else {
            // Already has same assignment, count as skipped duplicate row
            skippedRows.push({
              row: index + 1, // approximate relative to index
              email: row.email,
              house: row.house,
              reason: 'Duplicate row'
            })
          }
        } else {
          importedCount++
          studentsToUpsert.push(row)
        }
      })

      if (studentsToUpsert.length > 0) {
        const { error } = await adminSupabase
          .from('students')
          .upsert(studentsToUpsert, { onConflict: 'email' })

        if (error) {
          return { success: false, error: error.message }
        }
      }
    }

    // 3. Record action in audit log
    await logAdminAction(
      adminEmailNormalized,
      `CSV Imported: ${importedCount} imported, ${updatedCount} updated, ${skippedRows.length} skipped (Email: ${detectedEmailColName}, House: ${detectedHouseColName})`
    )

    revalidatePath('/')
    revalidatePath('/admin')
    return {
      success: true,
      imported: importedCount,
      updated: updatedCount,
      skipped: skippedRows.length,
      skippedRows: skippedRows.slice(0, 20),
      detectedEmailCol: detectedEmailColName,
      detectedHouseCol: detectedHouseColName
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to import CSV.' }
  }
}

/**
 * Resets all voting data, settings, and logs (Admin only, requires double-confirmation text "RESET")
 */
export async function resetVotesForTesting(confirmText: string) {
  try {
    if (confirmText !== 'RESET') {
      return { success: false, error: "Invalid confirmation string. Please type 'RESET' exactly." }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return { success: false, error: 'Unauthorized.' }
    }

    const adminEmailNormalized = normalizeEmail(user.email)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => normalizeEmail(e))
    if (!adminEmails.includes(adminEmailNormalized)) {
      return { success: false, error: 'Forbidden.' }
    }

    const { createAdminClient } = await import('@/utils/supabase/admin')
    const adminSupabase = createAdminClient()

    // 1. Delete all votes
    const { error: deleteVotesErr } = await adminSupabase
      .from('votes')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Deletes all rows

    if (deleteVotesErr) {
      return { success: false, error: deleteVotesErr.message }
    }

    // 2. Reset aggregates in house_votes table to 0
    const { error: resetCountsErr } = await adminSupabase
      .from('house_votes')
      .update({ count: 0 })
      .neq('house', 'None')

    if (resetCountsErr) {
      return { success: false, error: resetCountsErr.message }
    }

    // 3. Reset settings to open and hidden
    const { error: resetSettingsErr } = await adminSupabase
      .from('settings')
      .update({ voting_locked: false, results_visible: false, updated_at: new Date().toISOString() })
      .eq('id', 1)

    if (resetSettingsErr) {
      return { success: false, error: resetSettingsErr.message }
    }

    // 4. Record action in audit log
    await logAdminAction(adminEmailNormalized, 'Election Reset')

    revalidatePath('/')
    revalidatePath('/admin')
    revalidatePath('/live')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to reset votes.' }
  }
}
