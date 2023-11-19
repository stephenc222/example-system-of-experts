// OpenAIService.ts
import { OpenAI } from "openai"
import { AIService } from "./types"
import { sleep } from "./util"
import { MessageContentText } from "openai/resources/beta/threads/messages/messages"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY // Set your OpenAI API key in the environment variables

const MODEL = process.env.MODEL ?? "gpt-4-1106-preview"

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
})

export default class OpenAIService implements AIService {
  private openai: OpenAI
  private model: string

  constructor() {
    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY as string,
    })
    this.model = MODEL
  }

  async createAssistant(name: string, instructions: string): Promise<string> {
    const assistant = await this.openai.beta.assistants.create({
      name,
      instructions,
      model: this.model,
    })
    if (!assistant?.id) {
      throw new Error("Failed to create an assistant.")
    }
    return assistant.id
  }

  async run(threadId: string, assistantId: string, maxRetries = 10) {
    let run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    })
    let retries = 0
    while (run.status === "queued" || run.status === "in_progress") {
      if (retries >= maxRetries) throw new Error("Max retries reached.")
      await sleep(1000)
      run = await openai.beta.threads.runs.retrieve(threadId, run.id)
      retries++
    }
  }

  async createThread() {
    // ... Create a thread for a new conversation ...
    return (await openai.beta.threads.create()).id
  }

  async getMessagesList(threadId: string) {
    return this.openai.beta.threads.messages.list(threadId)
  }

  async getAssistantResponse(threadId: string): Promise<any> {
    const messages = await this.getMessagesList(threadId)
    const latestResponse = JSON.parse(
      (messages.data.shift()?.content.shift() as MessageContentText)?.text.value
    )
    return latestResponse
  }

  async addMessageToAssistant(
    threadId: string,
    message: object
  ): Promise<void> {
    await this.openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: JSON.stringify(message),
    })
  }

  // Other methods implementation ...
}
