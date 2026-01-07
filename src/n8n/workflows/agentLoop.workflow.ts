import { proxyActivities, uuid4 } from '@temporalio/workflow'
import type { AiChatInput, AiChatOutput } from '../activities/ai.activities'

const { aiChat } = proxyActivities<{
  aiChat: (input: AiChatInput) => Promise<AiChatOutput>
}>({
  startToCloseTimeout: '1 minute',
  retry: { backoffCoefficient: 2, initialInterval: '3 seconds' }
})

export type LoopItem = { [k: string]: any } // e.g., { name: string; code?: number }

export type AgentLoopInput = {
  items: LoopItem[]
  textTemplate: string // e.g., "test {{ increment by one each loop }}"
  systemMessage?: string
  model?: string
  failRate?: number
}

export type AgentLoopOutput = {
  runId: string
  results: Array<{
    index: number
    input: LoopItem
    userText: string
    response: string
  }>
}

function render(text: string, index: number, item: LoopItem): string {
  let out = text
  out = out.replaceAll('{{ increment by one each loop }}', String(index + 1))
  out = out.replaceAll('{{i}}', String(index))
  out = out.replaceAll('{{index1}}', String(index + 1))

  // Replace {{ item.foo }} tokens
  out = out.replace(/\{\{\s*item\.([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = item?.[key]
    return v === undefined || v === null ? '' : String(v)
  })

  return out
}

export async function agentLoopWorkflow(input: AgentLoopInput): Promise<AgentLoopOutput> {
  const { items, textTemplate, systemMessage, model, failRate = 0 } = input

  const runId = `agent-loop-${uuid4()}`
  const results: AgentLoopOutput['results'] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const userText = render(textTemplate, i, item)

    const { response } = await aiChat({
      userText,
      systemMessage,
      model,
      failRate
    })

    results.push({
      index: i,
      input: item,
      userText,
      response
    })
  }

  return { runId, results }
}