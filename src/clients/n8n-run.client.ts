import 'dotenv/config'
import { Connection, Client } from '@temporalio/client'
import { nanoid } from 'nanoid'
import { getTemporalClientOptions } from '../utils'


import { aiAgentChildWorkflow } from '../n8n/workflows/aiAgentChild.workflow'
import { parentLoopAndCallChildWorkflow } from '../n8n/workflows/loopAndCallChildParent.workflow'

const WORKFLOW_MAP = {
  aiAgentChildWorkflow,
  parentLoopAndCallChildWorkflow,
} as const


async function run() {
  const [workflowName, jsonArg] = process.argv.slice(2)
  if (!workflowName || !jsonArg) {
    throw new Error(`Usage: npm run n8n: run <workflowName> '<json>'`)
  }

  const wf = (WORKFLOW_MAP as any)[workflowName]
  if (! wf) throw new Error(`Unknown workflow: ${workflowName}`)

  const input = JSON.parse(jsonArg)

  const connection = await Connection.connect(getTemporalClientOptions())
  const client = new Client({ connection, namespace: process.env.NAMESPACE })

  const id = `n8n-${workflowName}-${nanoid()}`.toLowerCase().replaceAll('_', '')
  const handle = await client.workflow.start(wf, {
    taskQueue: 'n8n-queue',
    args: [input],
    workflowId:  id
  })

  console.log(`Workflow ${handle.workflowId} running`)
  console.log(JSON.stringify(await handle.result(), null, 2))
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})