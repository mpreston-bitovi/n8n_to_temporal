import { NativeConnection, Worker } from '@temporalio/worker'
import { getTemporalClientOptions } from '../utils'
import * as activities from './activities'

const TASK_QUEUE = 'n8n-queue'

async function run() {
  const connection = await NativeConnection.connect(getTemporalClientOptions())

  const worker = await Worker.create({
    connection,
    namespace: process.env.NAMESPACE,
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve('./workflows/index'),
    activities
  })

  console.log(`n8n worker polling task queue: ${TASK_QUEUE}`)
  await worker.run()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})