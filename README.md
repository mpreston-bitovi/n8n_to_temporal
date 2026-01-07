# n8n → Temporal: Porting Workflows

This repository is a lightweight scaffold for porting n8n workflows to Temporal using TypeScript. It provides:
- A single “n8n” domain worker and task queue
- A small activities library (I/O and AI)
- A generic client you can use to start any workflow by name
- Clear conventions to add more workflows quickly

---

## Quick Start

1) Prerequisites
- Node 18+ (or Docker)
- Temporal CLI (for local dev server): `temporal server start-dev`
- OpenAI API key (or update `chat-gpt.ts` to use a different model/provider)

2) Environment
Create a `.env`:
```
NAMESPACE=default
TEMPORAL_HOST_URL=localhost:7233
OPENAI_API_KEY=your-openai-key
```

If your worker runs in Docker and the Temporal server runs on your Mac:
- Start Temporal with: `temporal server start-dev --ip 0.0.0.0`
- In `docker-compose.yml`, set `TEMPORAL_HOST_URL=host.docker.internal:7233`

3) Install dependencies
```
npm ci
```

4) Start the worker
- On host:
  ```
  npm run n8n:worker
  ```
- In Docker:
  ```
  docker compose up --build n8n-worker
  ```

5) Run a workflow
```
npm run n8n:run processN8nJsonSimpleWorkflow '{"items":[{"name":"Hello","code":1},{"name":"Second item","code":2}]}'
```

Open Temporal UI at http://localhost:8233 (Namespace: default) to observe executions.

Scripts (package.json):
```json
{
  "scripts": {
    "build": "tsc --build",
    "n8n:worker": "ts-node src/n8n/worker.ts",
    "n8n:run": "ts-node src/clients/n8n-run.client.ts"
  }
}
```

---

## Project Structure

```
src/
  clients/
    n8n-run.client.ts         # Generic client to start any workflow by name
  n8n/
    activities/
      ai.activities.ts        # AI & chat activities (I/O, LLM calls)
      transform.activities.ts # Pure transforms or non-deterministic helpers
      index.ts                # Barrel export of activities
    workflows/
      simpleDefine.workflow.ts# Example workflow (maps n8n "Define" pattern)
      agentLoop.workflow.ts   # Example loop + AI prompt workflow (optional)
      index.ts                # Barrel export of workflows
    worker.ts                 # Single n8n domain worker for all workflows
  chat-gpt.ts                 # OpenAI Chat helper (memoized)
  utils.ts                    # Temporal client options, misc helpers
```

Core ideas:
- Workflows orchestrate steps (deterministic logic only).
- Activities perform I/O (LLM/HTTP/DB/files), randomness, or time reads.
- One worker process loads all n8n workflows and activities, and polls a single task queue (e.g., `n8n-queue`).
- The client starts workflows by name with typed JSON input.

---

## Mapping n8n Nodes to Temporal

- Triggers (Manual Trigger, Webhook)
  - Become workflow inputs (provided by the client).
- SplitInBatches / Loop
  - A `for` loop in the workflow; for very large sets, use `continueAsNew`.
- Code / Set / Transform
  - If pure and deterministic → can be in workflow.
  - If non-deterministic or I/O → move to an activity.
- HTTP / DB / S3 / AI
  - Always activities.
- Sub-Workflow (n8n calling another workflow)
  - Temporal child workflow (`startChild`).
- Wait for external event
  - Temporal Signals (for input) + Timers (`sleep`) if needed.
- Status checks
  - Temporal Queries.

Keep non-determinism out of workflows:
- No `Date.now()`, `Math.random()`, `fetch`, environment reads, or network calls in workflow code. Put these in activities.

---

## How to Add a New Workflow (Step-by-Step)

Say you have an n8n workflow with:
- Manual Trigger with pinned data
- SplitInBatches loop
- OpenAI Chat + Agent prompt with a typed template

We’ll implement it in four steps.

### 1) Define/Reuse Activities

Add activity functions for any external calls. Many flows can reuse `aiChat` in `ai.activities.ts`:

```ts
export type AiChatInput = { systemMessage?: string; userText: string; model?: string; failRate?: number }
export type AiChatOutput = { response: string }

export async function aiChat(input: AiChatInput): Promise<AiChatOutput> {
  // Uses createMemoizedOpenAI -> returns a getter, call it to get the model instance
  const getModel = input.model ? createMemoizedOpenAI(input.model) : createMemoizedOpenAI()
  const chat = getModel()
  const res = await chat.invoke([
    ['system', input.systemMessage ?? 'You are a helpful assistant'],
    ['human', input.userText],
  ])
  // normalize `res.content` to string ...
  return { response: /* string */ }
}
```

Export from `src/n8n/activities/index.ts`:
```ts
export * from './ai.activities'
export * from './transform.activities'
```

### 2) Create the Workflow

Create `src/n8n/workflows/<your>.workflow.ts`. Example “loop + prompt”:

```ts
import { proxyActivities, uuid4 } from '@temporalio/workflow'
import type { AiChatInput, AiChatOutput } from '../activities/ai.activities'

const { aiChat } = proxyActivities<{ aiChat: (i: AiChatInput) => Promise<AiChatOutput> }>({
  startToCloseTimeout: '1 minute',
  retry: { backoffCoefficient: 2, initialInterval: '3 seconds' }
})

export type AgentLoopInput = {
  items: Array<Record<string, any>>
  textTemplate: string
  systemMessage?: string
  model?: string
  failRate?: number
}

export type AgentLoopOutput = {
  runId: string
  results: Array<{ index: number; input: any; userText: string; response: string }>
}

function render(text: string, index: number, item: Record<string, any>): string {
  let out = text
  out = out.replaceAll('{{ increment by one each loop }}', String(index + 1))
  out = out.replaceAll('{{i}}', String(index))
  out = out.replaceAll('{{index1}}', String(index + 1))
  out = out.replace(/\{\{\s*item\.([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = item?.[key]
    return v == null ? '' : String(v)
  })
  return out
}

export async function agentLoopWorkflow(input: AgentLoopInput): Promise<AgentLoopOutput> {
  const { items, textTemplate, systemMessage, model, failRate = 0 } = input
  const runId = `agent-loop-${uuid4()}`
  const results: AgentLoopOutput['results'] = []

  for (let i = 0; i < items.length; i++) {
    const userText = render(textTemplate, i, items[i])
    const { response } = await aiChat({ userText, systemMessage, model, failRate })
    results.push({ index: i, input: items[i], userText, response })
  }

  return { runId, results }
}
```

### 3) Export the Workflow

Update `src/n8n/workflows/index.ts`:
```ts
export { processN8nJsonSimpleWorkflow } from './simpleDefine.workflow'
export { agentLoopWorkflow } from './agentLoop.workflow' // new
```

The worker (`src/n8n/worker.ts`) loads this index file and auto-registers your workflow.

### 4) Register in the Client (for CLI use)

Update `src/clients/n8n-run.client.ts`:

```ts
import { agentLoopWorkflow } from '../n8n/workflows/agentLoop.workflow'

const WORKFLOW_MAP = {
  processN8nJsonSimpleWorkflow,
  agentLoopWorkflow, // new
} as const
```

Now you can start it by name from the CLI.

### 5) Run It

Start Temporal and the worker (see Quick Start), then run:

```
npm run n8n:run agentLoopWorkflow \
'{"items":[{"name":"Hello","code":1},{"name":"Second item","code":2}],"textTemplate":"test {{ increment by one each loop }}","systemMessage":"You are a helpful assistant"}'
```

---

## Calling One Workflow from Another (Child Workflows)

Equivalent to n8n “Workflow” node:

```ts
import { startChild } from '@temporalio/workflow'

// inside a workflow:
const handle = await startChild('agentLoopWorkflow', {
  taskQueue: 'n8n-queue',
  args: [{ items, textTemplate: 'Hello {{ item.name }}' }],
})
const childResult = await handle.result()
```

Tip: Keep child and parent workflows in the same domain/queue unless you need isolation.

---

## Docker Notes

Minimal `Dockerfile`:
```dockerfile
FROM node:20
WORKDIR /usr/src/app
COPY package.json package.json
COPY package-lock.json package-lock.json
RUN npm ci
COPY tsconfig.json tsconfig.json
COPY src src
CMD ["npx", "ts-node", "src/n8n/worker.ts"]
```

`docker-compose.yml` (worker only):
```yaml
services:
  n8n-worker:
    container_name: temporal_n8n_worker
    build:
      context: .
      dockerfile: Dockerfile
    restart: always
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - NAMESPACE=${NAMESPACE}
      - TEMPORAL_HOST_URL=host.docker.internal:7233
    volumes:
      - ./src:/usr/src/app/src
    command: >
      sh -c "sleep 3 &&
             npx nodemon --watch src --ext ts src/n8n/worker.ts"
```

Ensure the Temporal server is reachable from inside Docker: start it with `--ip 0.0.0.0` and use `host.docker.internal:7233` in the container.

---

## Troubleshooting

- UI shows “No Workers Running”
  - Worker not started or crashed
  - Task queue mismatch (client vs worker)
  - Namespace mismatch (`default` vs something else)
  - Wrong `TEMPORAL_HOST_URL` when running in Docker

- Type errors using the OpenAI helper
  - `createMemoizedOpenAI` returns a getter function; call it first:
    ```ts
    const getModel = createMemoizedOpenAI()
    const chat = getModel()
    const res = await chat.invoke([...])
    ```

- LLM response is `[object Object]`
  - Normalize `response.content` to string (check for array parts and `.text`).

- Large loops
  - Consider chunking the list and using `continueAsNew` to keep workflow history small.

- Determinism violations
  - Move I/O, env reads, time, and randomness to activities. Only orchestrate in workflows.

---

## Adding Many Workflows Quickly (Checklist)

For each new n8n workflow you port:
- [ ] Identify inputs/outputs (define TypeScript types).
- [ ] Implement activities for all I/O steps (LLM/HTTP/DB/etc).
- [ ] Implement the workflow to orchestrate calls and branching.
- [ ] Export from `src/n8n/workflows/index.ts`.
- [ ] Add to the client `WORKFLOW_MAP` for easy CLI runs.
- [ ] Restart worker (nodemon will hot-reload if using Docker compose).
- [ ] Run with `npm run n8n:run <workflowName> '<json>'`.

That’s it — one worker, one task queue, unlimited workflows.