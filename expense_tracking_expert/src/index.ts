import amqp from "amqplib"

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "rabbitmq"
const RABBITMQ_USERNAME = process.env.RABBITMQ_USERNAME || "guest"
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || "guest"
const RABBITMQ_URL = `amqp://${RABBITMQ_USERNAME}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}`
const EXPENSE_QUEUE = "expense_queue"
const CATEGORIZED_EXPENSE_QUEUE = "categorized_expense_queue"

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
  try {
    const conn = await connectWithRetry()
    console.log("Connected to RabbitMQ")
    const channel = await conn.createChannel()

    await channel.assertQueue(EXPENSE_QUEUE, { durable: false })
    await channel.assertQueue(CATEGORIZED_EXPENSE_QUEUE, { durable: false })

    await channel.consume(EXPENSE_QUEUE, (msg) => {
      if (msg !== null) {
        console.log(`Received expense: ${msg.content.toString()}`)
        const expense = JSON.parse(msg.content.toString())

        // Here you would add logic to categorize the expense
        const categorizedExpense = categorizeExpense(expense)

        // Then send the categorized expense to the next queue
        channel.sendToQueue(
          CATEGORIZED_EXPENSE_QUEUE,
          Buffer.from(JSON.stringify(categorizedExpense))
        )

        console.log(
          `Categorized expense and sent to the savings expert: ${JSON.stringify(
            categorizedExpense
          )}`
        )
        channel.ack(msg)
      }
    })

    console.log(`Waiting for expenses. To exit press CTRL+C`)
  } catch (error) {
    console.error("Failed to start the expense tracking expert:", error)
  }
}

function categorizeExpense(expense: any): any {
  // Placeholder logic for categorizing an expense
  // In a real-world scenario, you would implement more complex logic
  expense.category = "Utilities" // Example hardcoded category
  return expense
}

start()
