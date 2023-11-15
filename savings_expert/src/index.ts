import amqp from "amqplib"
import { OpenAI } from "openai"
import { MessageContentText } from "openai/resources/beta/threads/messages/messages"

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "rabbitmq"
const RABBITMQ_USERNAME = process.env.RABBITMQ_USERNAME || "guest"
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || "guest"
const OPENAI_API_KEY = process.env.OPENAI_API_KEY // Set your OpenAI API key in the environment variables
const RABBITMQ_URL = `amqp://${RABBITMQ_USERNAME}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}`
const CATEGORIZED_EXPENSE_QUEUE = "categorized_expense_queue"
const SAVINGS_ADVICE_QUEUE = "savings_advice_queue" // Queue for publishing savings advice

const ASSISTANT_NAME = "SavingsExpert"
const ASSISTANT_INSTRUCTIONS = `**You are the 'SavingsExpert':** A virtual assistant specialized in analyzing categorized personal financial data to provide insights and suggestions for savings. Your task is to offer advice on how to save money based on the spending patterns evident from the categorized expenses.

**Instructions for Providing Savings Advice:**

1. **Understanding Spending Patterns:**
   - Review the categorized expense data to identify spending trends and areas where the user may be able to save money.

2. **Advice Logic:**
   - Provide concrete suggestions for savings based on the expense categories. For example, suggest budget adjustments, recommend cheaper alternatives, or highlight opportunities for cost-cutting.

3. **Output Format:**
   - Your response should be a JSON object with key-value pairs that include the original expense description, the category, and your savings advice.

**Example JSON Response:**

For a list of expenses categorized as "Entertainment", your response should be a raw JSON string (no markdown syntax, just raw text that could be parsed directly as JSON) like this:

{
  "description": "Monthly subscriptions",
  "category": "Entertainment",
  "advice": "Consider evaluating whether all subscriptions are necessary, or look for bundled options that could reduce the overall monthly cost."
}
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
  await channel.assertQueue(CATEGORIZED_EXPENSE_QUEUE, { durable: false })
  await channel.assertQueue(SAVINGS_ADVICE_QUEUE, { durable: false })
  const assistant = await createSavingsExpertAssistant()
  console.log("created savings_expert")

  channel.consume(CATEGORIZED_EXPENSE_QUEUE, async (msg) => {
    if (msg !== null) {
      const expense = JSON.parse(msg.content.toString())
      // TODO: accepting on the message payload a "threadId", to be able to "continue a conversation"
      const thread = await createThread()

      await addMessageToThread(thread.id, expense.description)
      const run = await runAssistant(thread.id, assistant.id)

      console.log("finished run:", JSON.stringify({ run: run.status }))

      const messages = await getAssistantMessages(thread.id)

      const latestAssistantMessage = (
        messages.data.shift()?.content.shift() as MessageContentText
      )?.text

      const savingsAdvice = JSON.parse(latestAssistantMessage.value)

      channel.sendToQueue(
        SAVINGS_ADVICE_QUEUE,
        Buffer.from(JSON.stringify(savingsAdvice))
      )

      console.log(`Provided savings advice: ${JSON.stringify(savingsAdvice)}`)
      channel.ack(msg)
    }
  })

  console.log(`Waiting for expenses. To exit press CTRL+C`)
}

start()
