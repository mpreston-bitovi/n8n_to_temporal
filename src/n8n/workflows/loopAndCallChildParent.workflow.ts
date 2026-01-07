import { startChild, proxyActivities, uuid4 } from '@temporalio/workflow'
import type { AiAgentChildInput, AiAgentChildOutput } from './aiAgentChild.workflow'

// Only need activities if parent does its own I/O
// In this case, parent is just orchestration
const activities = proxyActivities<{}>({
  startToCloseTimeout: '1 minute'
})

/**
 * Parent workflow: loops over items and calls child workflow for each
 * Equivalent to:  "Loop Over Items" + "Call 'testing temporal'" n8n workflow
 */
export type ParentLoopChildInput = {
  items: Array<{
    name: string
    usermessage: string
  }>
  systemMessage?: string
  model?: string
}

export type ParentLoopChildOutput = {
  runId: string
  results: Array<{
    item: { name: string; usermessage: string }
    childResult: AiAgentChildOutput
  }>
}

export async function parentLoopAndCallChildWorkflow(
  input: ParentLoopChildInput
): Promise<ParentLoopChildOutput> {
  const { items, systemMessage, model } = input
  const runId = `parent-loop-${uuid4()}`
  const results: ParentLoopChildOutput['results'] = []

  // Loop over each item
  for (const item of items) {
    // Start child workflow (async)
    const childHandle = await startChild('aiAgentChildWorkflow', {
      taskQueue: 'n8n-queue',  // Same task queue
      args: [
        {
          usermessage: item.usermessage,
          systemMessage,
          model
        } as AiAgentChildInput
      ],
      workflowId: `child-${item.name}-${uuid4()}`.toLowerCase()
    })

    // Wait for child to complete and get result
    const childResult = await childHandle.result()

    results.push({
      item,
      childResult
    })
  }

  return { runId, results }
}