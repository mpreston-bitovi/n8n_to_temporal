import { createMemoizedOpenAI } from '../../chat-gpt'

export type AiDefineTermInput = {
  name: string
  systemMessage?: string
  model?: string
  failRate?: number
}

export type AiDefineTermOutput = {
  name: string
  definition: string
}

export async function aiDefineTerm(input: AiDefineTermInput): Promise<AiDefineTermOutput> {
  const {
    name,
    systemMessage = 'You are a helpful assistant',
    model,
    failRate = 0
  } = input

  if (failRate) {
    const randomErr = Math.random()
    if (randomErr < failRate) throw new Error('Simulated AI failure')
  }

  // createMemoizedOpenAI returns a getter function – call it to obtain the model instance
  const getModel = model ? createMemoizedOpenAI(model) : createMemoizedOpenAI()
  const chat = getModel()

  const response = await chat.invoke([
    ['system', systemMessage],
    ['human', `Define: ${name}`]
  ])

  const definition =
    typeof response.content === 'string'
      ? response.content
      : Array.isArray(response.content)
        ? response.content.map((p: any) => (typeof p === 'string' ? p : p?.text ?? '')).join('\n')
        : String(response.content)

  return { name, definition }
}

export type AiChatInput = {
  systemMessage?: string
  userText: string
  model?: string
  failRate?: number
}
export type AiChatOutput = {
  response: string
}

export async function aiChat(input: AiChatInput): Promise<AiChatOutput> {
  const {
    systemMessage = 'You are a helpful assistant',
    userText,
    model,
    failRate = 0
  } = input

  if (failRate) {
    const randomErr = Math.random()
    if (randomErr < failRate) throw new Error('Simulated AI failure')
  }

  const getModel = model ? createMemoizedOpenAI(model) : createMemoizedOpenAI()
  const chat = getModel()

  const result = await chat.invoke([
    ['system', systemMessage],
    ['human', userText]
  ])

  const response =
    typeof result.content === 'string'
      ? result.content
      : Array.isArray(result.content)
        ? result.content.map((p: any) => (typeof p === 'string' ? p : p?.text ?? '')).join('\n')
        : String(result.content)

  return { response }
}