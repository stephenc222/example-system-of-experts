import amqp from "amqplib"
import { OpenAI } from "openai"
import { MessageContentText } from "openai/resources/beta/threads/messages/messages"

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "rabbitmq"
const RABBITMQ_USERNAME = process.env.RABBITMQ_USERNAME || "guest"
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || "guest"
const OPENAI_API_KEY = process.env.OPENAI_API_KEY // Set your OpenAI API key in the environment variables
const RABBITMQ_URL = `amqp://${RABBITMQ_USERNAME}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}`
const EXPENSE_QUEUE = "expense_queue"
const MANAGER_QUEUE = "manager_queue"
const CHAT_QUEUE = "chat_queue" // Queue for publishing savings advice

const ASSISTANT_NAME = "ManagerExpert"
const ASSISTANT_INSTRUCTIONS = `**You are the 'ManagerExpert':** A virtual assistant responsible for analyzing incoming messages and routing them to the appropriate expert queue based on the identified intent of the message.

**Instructions for Message Routing:**

1. **Intent Analysis:**
   - Examine the content of each incoming message to determine the user's intent.
   - Identify keywords or phrases that indicate which expert should handle the request.

2. **Routing Decision:**
   - Decide which queue the message should be forwarded to based on the analysis.
   - The queues are 'chat_queue' for general conversation and 'expense_queue' for financial-related queries.

3. **Message Forwarding:**
   - Forward the message as a JSON object. Include the 'message' field containing the original message and the 'queue' field indicating the target queue.

**Example JSON Message Forwarding:**

When you receive a user message and determine it should go to the 'expense_queue', and your response should only be a raw JSON string (no json markdown syntax, just raw text that could be parsed directly as JSON):

{
  "message": "I spent $100 on groceries last night.",
  "queue": "expense_queue"
}

**Efficiency and Timeliness:**
- Ensure messages are routed promptly to keep user wait times to a minimum.

**Fallback Strategy:**
- If the intent is not clear from the message, either ask for clarification or default to a queue designed for handling ambiguous queries.

**Maintain User Trust:**
- Communicate to users that their messages are being processed and will be attended to shortly.
`

// The rest of your TypeScript code setting up the OpenAI and RabbitMQ connections would remain unchanged.

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
})

async function createSavingsExpertAssistant() {
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
  return openai.beta.threads.create()
}

async function addMessageToThread(threadId: string, content: string) {
  // ... Add a message to the thread ...
  return openai.beta.threads.messages.create(threadId, {
    role: "user",
    content,
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
  await channel.assertQueue(MANAGER_QUEUE, { durable: false })
  await channel.assertQueue(EXPENSE_QUEUE, { durable: false })
  await channel.assertQueue(CHAT_QUEUE, { durable: false })
  const assistant = await createSavingsExpertAssistant()
  console.log("created manager_expert")

  channel.consume(MANAGER_QUEUE, async (msg) => {
    if (msg !== null) {
      const payload = JSON.parse(msg.content.toString())
      // TODO: accepting on the message payload a "threadId", to be able to "continue a conversation"
      const thread = await createThread()

      console.log("RECEIVED:", JSON.stringify({ payload }))

      await addMessageToThread(thread.id, payload)
      const run = await runAssistant(thread.id, assistant.id)

      console.log("finished run:", JSON.stringify({ run: run.status }))

      const messages = await getAssistantMessages(thread.id)

      const latestAssistantMessage = JSON.parse(
        (messages.data.shift()?.content.shift() as MessageContentText)?.text
          .value
      )

      console.log("MANAGER_EXPERT:", JSON.stringify({ latestAssistantMessage }))

      channel.sendToQueue(
        latestAssistantMessage.queue,
        Buffer.from(JSON.stringify(latestAssistantMessage))
      )

      console.log(
        `Provided expert manager decision: ${JSON.stringify(
          latestAssistantMessage
        )}`
      )
      channel.ack(msg)
    }
  })

  console.log(`Waiting for client_api messages. To exit press CTRL+C`)
}

start()
