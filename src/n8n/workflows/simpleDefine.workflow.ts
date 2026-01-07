import { proxyActivities, uuid4 } from '@temporalio/workflow'
import type { AiDefineTermInput, AiDefineTermOutput } from '../activities/ai.activities'

const { aiDefineTerm } = proxyActivities<{
  aiDefineTerm: (input: AiDefineTermInput) => Promise<AiDefineTermOutput>
}>({
  startToCloseTimeout: '1 minute',
  retry: { backoffCoefficient: 2, initialInterval: '3 seconds' }
})

export type N8nItem = { name: string; code?: number }

export type N8nSimplifiedInput = {
  items: N8nItem[]
  systemMessage?: string
  model?: string
  conditionAllow?: boolean
  failRate?: number
}

export type N8nSimplifiedOutput = {
  runId: string
  processed: Array<{
    input: N8nItem
    skipped: boolean
    ai?: AiDefineTermOutput
  }>
}

export async function processN8nJsonSimpleWorkflow(input: N8nSimplifiedInput): Promise<N8nSimplifiedOutput> {
  const {
    items,
    systemMessage = 'You are a helpful assistant',
    model,
    conditionAllow = true,
    failRate = 0
  } = input

  const runId = `n8n-simple-${uuid4()}`
  const processed: N8nSimplifiedOutput['processed'] = []

  for (const item of items) {
    const editedName = item.name

    if (!conditionAllow) {
      processed.push({ input: item, skipped: true })
      continue
    }

    const ai = await aiDefineTerm({ name: editedName, systemMessage, model, failRate })
    processed.push({ input: item, skipped: false, ai })
  }

  return { runId, processed }
}