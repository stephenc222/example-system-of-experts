export interface AIService {
  createAssistant(name: string, instructions: string): Promise<string>
  addMessageToAssistant(threadId: string, message: object): Promise<void>
  getAssistantResponse(threadId: string): Promise<any>
  createThread(): Promise<string>
  run(threadId: string, assistantId: string, maxRetries?: number): Promise<void>
}

export interface MessageProcessor {
  process(payload: any): Promise<any>
}
