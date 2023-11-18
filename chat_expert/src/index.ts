import amqp from "amqplib"
import { OpenAI } from "openai"
import { MessageContentText } from "openai/resources/beta/threads/messages/messages"

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "rabbitmq"
const RABBITMQ_USERNAME = process.env.RABBITMQ_USERNAME || "guest"
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || "guest"
const OPENAI_API_KEY = process.env.OPENAI_API_KEY // Set your OpenAI API key in the environment variables
const RABBITMQ_URL = `amqp://${RABBITMQ_USERNAME}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}`
const CHAT_QUEUE = "chat_queue"
const MANAGER_QUEUE = "manager_queue"
const CLIENT_QUEUE = "client_queue" // to send back to the user

const ASSISTANT_NAME = "ChatExpert"
const ASSISTANT_INSTRUCTIONS = `**You are the 'ChatExpert':** A virtual assistant specialized in conversing with users. Your task is to engage users in natural dialogue, understand their queries related to personal finance, and maintain a conversational tone while interacting.

**Instructions for Conversational Engagement and Queue Routing:**

1. **Engaging in Dialogue:**
   - Engage users with friendly and open-ended questions to encourage detailed responses.
   - Use a conversational tone that is professional yet approachable.

2. **Understanding Queries:**
   - Listen carefully to the user's concerns or questions and acknowledge their needs.
   - Clarify any ambiguities with follow-up questions to ensure you understand their request fully.

3. **Maintaining Context:**
   - Keep track of the conversation's context to provide responses that are coherent and follow the thread of the dialogue.

4. **Output Format:**
   - Your responses should be in the form of a JSON object that includes a 'message' field with your conversational reply, and a 'queue' field indicating the appropriate RabbitMQ queue.
   
5. **Routing Logic:**
   - Use 'client_queue' to send responses directly back to the user.
   - Use 'manager_queue' if the conversation requires input from or notification to other services for further processing or expert analysis.

**Example JSON Response:**

When a user asks a question about personal finance, your response routed to the 'client_queue' should be a raw JSON string formatted as follows:

{
  "message": "It sounds like you're looking to get a better handle on your subscriptions. I can certainly help with that. Could you tell me more about the services you're currently subscribed to?",
  "queue": "client_queue"
}

**Providing Helpful Prompts:**
- If the user seems unsure about what to ask, offer prompts or topics related to personal finance to guide the conversation.

**Maintaining User Engagement:**
- Use affirmations to keep the user engaged and ensure they feel heard. If the conversation leads to a specific request that requires expert analysis, inform the user that you are getting the needed help, and route the message through the 'chat_queue'.

**Privacy and Discretion:**
- Assure users that their financial discussions are kept confidential and handle all personal data with the utmost care and security.

**Note:** The JSON response should be a raw string without markdown syntax (do not include "\`\`\`json" nor \`\`\`), ready for direct parsing as JSON.
`

// The rest of your TypeScript code setting up the OpenAI and RabbitMQ connections would remain unchanged.

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
})

async function createChatExpertAssistant() {
  // ... Create Assistant as per the OpenAI documentation ...
  return openai.beta.assistants.create({
    name: ASSISTANT_NAME,
    instructions: ASSISTANT_INSTRUCTIONS,
    tools: [{ type: "code_interpreter" }],
    model: "gpt-4-1106-preview",
  })
}

async function createThread() {
  // ... Create a thread for a new conversation ...
  return (await openai.beta.threads.create()).id
}

async function addMessageToThread(message: {
  threadId: string
  [key: string]: string | number
}) {
  // ... Add a message to the thread ...
  const { threadId, ...content } = message
  return openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: JSON.stringify(content),
  })
}
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runAssistant(threadId: string, assistantId: string) {
  let run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
  })
  while (run.status === "queued" || run.status === "in_progress") {
    await sleep(1000)
    run = await openai.beta.threads.runs.retrieve(threadId, run.id)
  }
  return run
}

async function getAssistantMessages(threadId: string) {
  return openai.beta.threads.messages.list(threadId)
}

async function connectWithRetry(
  retries: number = 5,
  interval: number = 15000
): Promise<amqp.Connection> {
  let lastError: unknown

  for (let i = 0; i < retries; i++) {
    try {
      return await amqp.connect(RABBITMQ_URL)
    } catch (error) {
      lastError = error
      console.error(
        `Failed to connect to RabbitMQ (attempt ${i + 1}/${retries})`
      )
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
  }

  throw lastError
}

async function start() {
  const conn = await connectWithRetry()
  const channel = await conn.createChannel()
  await channel.assertQueue(CHAT_QUEUE, { durable: false })
  await channel.assertQueue(CLIENT_QUEUE, { durable: false })
  await channel.assertQueue(MANAGER_QUEUE, { durable: false })
  const assistant = await createChatExpertAssistant()
  console.log("created chat_expert")

  channel.consume(CHAT_QUEUE, async (msg) => {
    if (msg !== null) {
      const payload = JSON.parse(msg.content.toString())
      console.log("CHAT_EXPERT RECEIVED PAYLOAD:", JSON.stringify({ payload }))
      // TODO: accepting on the message payload a "threadId", to be able to "continue a conversation"
      if (!payload.threadId) {
        payload.threadId = await createThread()
      }

      await addMessageToThread(payload)
      const run = await runAssistant(payload.threadId, assistant.id)

      console.log("finished run:", JSON.stringify({ run: run.status }))

      const messages = await getAssistantMessages(payload.threadId)

      const latestAssistantMessage = JSON.parse(
        (messages.data.shift()?.content.shift() as MessageContentText)?.text
          .value
      )

      console.log(JSON.stringify({ latestAssistantMessage }))

      channel.sendToQueue(
        latestAssistantMessage.queue,
        Buffer.from(
          JSON.stringify({
            ...latestAssistantMessage,
            threadId: payload.threadId,
          })
        )
      )

      console.log(`chat message: ${JSON.stringify(latestAssistantMessage)}`)
      channel.ack(msg)
    }
  })

  console.log(`Waiting for chat messages. To exit press CTRL+C`)
}

start()
