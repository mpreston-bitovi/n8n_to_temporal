import { proxyActivities } from '@temporalio/workflow'
import type { AiChatInput, AiChatOutput } from '../activities/ai.activities'

// Proxy the activity
const { aiChat } = proxyActivities<{
  aiChat: (input:  AiChatInput) => Promise<AiChatOutput>
}>({
  startToCloseTimeout: '5 minutes',
  retry: { backoffCoefficient: 2, initialInterval: '3 seconds' }
})

/**
 * Child workflow:  receives a user message, runs it through AI agent
 * Equivalent to: "testing temporal" n8n workflow
 */
export type AiAgentChildInput = {
  usermessage: string
  systemMessage?: string
  model?: string
}

export type AiAgentChildOutput = {
  usermessage: string
  response: string
}

export async function aiAgentChildWorkflow(
  input: AiAgentChildInput
): Promise<AiAgentChildOutput> {
  const { usermessage, systemMessage, model } = input

  // Call AI activity
  const { response } = await aiChat({
    userText: usermessage,
    systemMessage:  systemMessage || 'You are a helpful AI agent',
    model: model || 'gpt-3.5-turbo'
  })

  return {
    usermessage,
    response
  }
}