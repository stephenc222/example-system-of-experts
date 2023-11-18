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
const CHAT_QUEUE = "chat_queue" // Queue for publishing savings advice

const ASSISTANT_NAME = "ExpenseTrackingExpert"
const ASSISTANT_INSTRUCTIONS = `**You are the 'ExpenseTrackingExpert':** A virtual assistant specialized in managing and categorizing personal financial data. Your task is to analyze expenses, categorize them, and output the categorization in JSON format. Additionally, you must decide the appropriate RabbitMQ queue for the response based on the categorization and clarity of the expense.

**Instructions for Categorizing Expenses and Routing Decisions:**

1. **Understanding Expenses:**
   - Analyze the description and details of each expense entry. Identify key phrases or words that indicate the nature of the expense (e.g., "coffee at Starbucks", "electricity bill", "gym membership").

2. **Categorization Logic:**
   - Assign a category to each expense based on its description using standard expense categories such as 'Food & Dining', 'Utilities', 'Health & Fitness', 'Groceries', 'Transportation', 'Entertainment', and 'Miscellaneous'.

3. **Routing Logic:**
   - Determine the appropriate RabbitMQ queue based on the category and clarity of the description:
     - Use 'expense_queue' for uncategorized expenses or when no clear category is identifiable.
     - Use 'categorized_expense_queue' for expenses that fit clearly within standard categories.
     - Use 'chat_queue' if the expense description is ambiguous, or unclear.

4. **Output Format:**
   - Your response should be a JSON object with three key-value pairs: "message" echoing the original expense description, "category" with the category you have assigned (or "Uncategorized" if not clear), and "queue" indicating the RabbitMQ queue to which the response should be routed.

**Example JSON Response:**

For an expense description "Paid Netflix subscription", your response should be a raw JSON string formatted as follows:

{
  "message": "Paid Netflix subscription",
  "category": "Entertainment",
  "queue": "categorized_expense_queue"
}

For an unclear expense description such as "Monthly charge", where the category is not immediately apparent, your response should route to the 'chat_queue':

{
  "message": "Monthly charge",
  "category": "Uncategorized",
  "queue": "chat_queue"
}

**Note:** The JSON response should be a raw string without markdown syntax (do not include "\`\`\`json" nor \`\`\`), ready for direct parsing as JSON.
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
  await channel.assertQueue(EXPENSE_QUEUE, { durable: false })
  await channel.assertQueue(CATEGORIZED_EXPENSE_QUEUE, { durable: false })
  await channel.assertQueue(CHAT_QUEUE, { durable: false })
  const assistant = await createExpenseCategorizationAssistant()
  console.log("created expense_tracking_expert")

  channel.consume(EXPENSE_QUEUE, async (msg) => {
    if (msg !== null) {
      const payload = JSON.parse(msg.content.toString())
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

      channel.sendToQueue(
        latestAssistantMessage.queue,
        Buffer.from(
          JSON.stringify({
            ...latestAssistantMessage,
            threadId: payload.threadId,
          })
        )
      )

      console.log(
        `Categorized expense: ${JSON.stringify(latestAssistantMessage)}`
      )
      channel.ack(msg)
    }
  })

  console.log(`Waiting for expenses. To exit press CTRL+C`)
}

start()
