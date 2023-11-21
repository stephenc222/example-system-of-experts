import { AIService } from "./types"
import Logger from "./Logger"

export default class Expert {
  private assistantId: string
  private aiService: AIService
  private logger: Logger
  private name: string
  private constructor(
    name: string,
    assistantId: string,
    aiService: AIService,
    logger: Logger
  ) {
    this.assistantId = assistantId
    this.aiService = aiService
    this.logger = logger
    this.name = name
  }

  static async create(
    name: string,
    instructions: string,
    aiService: AIService
  ) {
    const assistantId = await aiService.createAssistant(name, instructions)
    const logger = new Logger(name)

    return new Expert(name, assistantId, aiService, logger)
  }

  // process the payload
  async process(payload: { threadId: string; [key: string]: string | number }) {
    // ... Add a message to the thread ...
    if (!payload.threadId) {
      payload.threadId = await this.aiService.createThread()
    }
    const { threadId, ...message } = payload
    this.logger.info(JSON.stringify({ payload }))
    // Add message to thread
    await this.aiService.addMessageToAssistant(threadId, message)
    await this.aiService.run(threadId, this.assistantId)
    const assistantResponse = await this.aiService.getAssistantResponse(
      threadId,
      this.assistantId
    )
    const latestResponse = {
      name: this.name,
      ...assistantResponse,
    }

    this.logger.info(JSON.stringify(latestResponse))
    return latestResponse
  }
}
