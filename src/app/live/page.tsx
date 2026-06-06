import { createClient } from '@/utils/supabase/server'
import LiveResultsContainer from './LiveResultsContainer'

export const dynamic = 'force-dynamic'

interface LivePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function LivePage(props: LivePageProps) {
  const searchParams = await props.searchParams
  const presentation = searchParams.presentation === 'true'

  const supabase = await createClient()

  // 1. Fetch initial house votes
  const { data: initialVotes } = await supabase
    .from('house_votes')
    .select('*')

  // 2. Fetch initial settings (lock state & results visible)
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single()

  const defaultSettings = { voting_locked: false, results_visible: false }

  return (
    <LiveResultsContainer
      initialVotes={initialVotes || []}
      initialSettings={settings || defaultSettings}
      presentationMode={presentation}
    />
  )
}
