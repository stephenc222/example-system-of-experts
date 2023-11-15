import amqp from "amqplib"
import { OpenAI } from "openai"
import { MessageContentText } from "openai/resources/beta/threads/messages/messages"

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "rabbitmq"
const RABBITMQ_USERNAME = process.env.RABBITMQ_USERNAME || "guest"
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || "guest"
const OPENAI_API_KEY = process.env.OPENAI_API_KEY // Set your OpenAI API key in the environment variables
const RABBITMQ_URL = `amqp://${RABBITMQ_USERNAME}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}`
const EXPENSE_QUEUE = "expense_queue"
const CATEGORIZED_EXPENSE_QUEUE = "categorized_expense_queue"

const ASSISTANT_NAME = "ExpenseTrackingExpert"
const ASSISTANT_INSTRUCTIONS = `**You are the 'ExpenseTrackingExpert':** A virtual assistant specialized in managing and categorizing personal financial data. Your task is to analyze expenses and output the categorization in JSON format.

**Instructions for Categorizing Expenses:**

1. **Understanding Expenses:**
   - Analyze the description and details of each expense entry. Identify key phrases or words that indicate the nature of the expense (e.g., "coffee at Starbucks", "electricity bill", "gym membership").

2. **Categorization Logic:**
   - Assign a category to each expense based on its description. Use standard expense categories such as 'Food & Dining', 'Utilities', 'Health & Fitness', 'Groceries', 'Transportation', 'Entertainment', and 'Miscellaneous'.

3. **Output Format:**
   - Your response should be a JSON object with two key-value pairs: "description" echoing the original expense description and "category" with the category you have assigned.

**Example JSON Response:**

For an expense description "Paid Netflix subscription", your response should only be a raw JSON string (no json markdown syntax, just raw text that could be parsed directly as JSON):

{
  "description": "Paid Netflix subscription",
  "category": "Entertainment"
}
`

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
})

async function createExpenseCategorizationAssistant() {
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
  await channel.assertQueue(EXPENSE_QUEUE, { durable: false })
  await channel.assertQueue(CATEGORIZED_EXPENSE_QUEUE, { durable: false })
  const assistant = await createExpenseCategorizationAssistant()
  console.log("created expense_tracking_expert")

  channel.consume(EXPENSE_QUEUE, async (msg) => {
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

      const categorizedExpense = JSON.parse(latestAssistantMessage.value)

      channel.sendToQueue(
        CATEGORIZED_EXPENSE_QUEUE,
        Buffer.from(JSON.stringify(categorizedExpense))
      )

      console.log(`Categorized expense: ${JSON.stringify(categorizedExpense)}`)
      channel.ack(msg)
    }
  })

  console.log(`Waiting for expenses. To exit press CTRL+C`)
}

start()
