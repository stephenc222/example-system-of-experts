import { AIService } from "./types"
import Logger from "./Logger"

export default class Expert {
  private assistantId: string
  private aiService: AIService
  private logger: Logger
  private expertName: string
  private constructor(
    name: string,
    assistantId: string,
    aiService: AIService,
    logger: Logger
  ) {
    this.assistantId = assistantId
    this.aiService = aiService
    this.logger = logger
    this.expertName = name
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
    const { threadId, ...content } = payload
    // Add message to thread
    await this.aiService.addMessageToAssistant(threadId, content)
    await this.aiService.run(threadId, this.assistantId)
    const latestResponse = {
      expertName: this.expertName,
      ...(await this.aiService.getAssistantResponse(threadId)),
    }

    this.logger.info(JSON.stringify(latestResponse))
    return latestResponse
  }
}
