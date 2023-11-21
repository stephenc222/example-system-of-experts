import axios from "axios"
import { AIService } from "./types"
import { CohereClient } from "cohere-ai"
import Logger from "./Logger"

const COHERE_API_KEY = process.env.COHERE_API_KEY // Set your OpenAI API key in the environment variables
const CONVERSATION_API =
  process.env.CONVERSATION_API || "http://conversation_api:3001"

const cohere = new CohereClient({
  token: COHERE_API_KEY as string,
})

export default class CohereAIService implements AIService {
  private logger: Logger
  constructor() {
    this.logger = new Logger("CohereAIService")
  }
  async createAssistant(name: string, instructions: string): Promise<string> {
    const response = await axios.post(`${CONVERSATION_API}/assistants`, {
      name,
      instructions,
    })
    return response.data.id
  }

  async addMessageToAssistant(
    threadId: string,
    message: object
  ): Promise<void> {
    this.logger.info(`add message: ${JSON.stringify({ message, threadId })}`)
    await axios.post(`${CONVERSATION_API}/conversations/${threadId}/messages`, {
      ...message,
    })
  }

  async getAssistantResponse(
    threadId: string,
    assistantId: string
  ): Promise<any> {
    const assistant = await axios.get(
      `${CONVERSATION_API}/assistants/${assistantId}`
    )
    const { instructions } = assistant.data
    const messages = await axios.get(
      `${CONVERSATION_API}/conversations/${threadId}/messages`
    )
    const lastMessage = messages.data[messages.data.length - 1]
    if (lastMessage) {
      const response = await cohere.generate({
        prompt: `${instructions}

        Now, please handle this user message, and print "---" after the JSON:

        ${lastMessage.content}`,
        maxTokens: 500,
      })
      const latestResponse = JSON.parse(
        response.generations[0].text.split("-").shift() as string
      )

      return latestResponse
    }
    throw new Error("No messages found for this thread.")
  }

  async createThread(): Promise<string> {
    const response = await axios.post(`${CONVERSATION_API}/conversations`)
    return response.data.id
  }

  async run(
    threadId: string,
    assistantId: string,
    maxRetries: number = 3
  ): Promise<void> {
    try {
      const response = await this.getAssistantResponse(threadId, assistantId)
      await this.addMessageToAssistant(threadId, {
        assistantId,
        message: response,
      })
    } catch (error) {
      if (!maxRetries) {
        this.logger.error(
          `Error attempting to generate text from Cohere:${JSON.stringify(
            error
          )}`
        )
        throw new Error("exceed max retries for Cohere text generation call")
      }
      this.logger.warn("attempting to retry run")
      this.run(threadId, assistantId, maxRetries - 1)
    }
  }
}
