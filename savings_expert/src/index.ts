import amqp from "amqplib"

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "rabbitmq"
const RABBITMQ_USERNAME = process.env.RABBITMQ_USERNAME || "guest"
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || "guest"
const RABBITMQ_URL = `amqp://${RABBITMQ_USERNAME}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}`
const CATEGORIZED_EXPENSE_QUEUE = "categorized_expense_queue"
const SAVINGS_ADVICE_QUEUE = "savings_advice_queue"

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

    await channel.assertQueue(CATEGORIZED_EXPENSE_QUEUE, { durable: false })
    await channel.assertQueue(SAVINGS_ADVICE_QUEUE, { durable: false })

    await channel.consume(CATEGORIZED_EXPENSE_QUEUE, (msg) => {
      if (msg !== null) {
        console.log(`Received categorized expense: ${msg.content.toString()}`)
        const categorizedExpense = JSON.parse(msg.content.toString())

        // Here you would add logic to analyze the expense and find savings
        const savingsAdvice = analyzeExpenseForSavings(categorizedExpense)

        // Then send the savings advice to the next queue or to the user
        channel.sendToQueue(
          SAVINGS_ADVICE_QUEUE,
          Buffer.from(JSON.stringify(savingsAdvice))
        )

        console.log(
          `Analyzed savings and sent advice: ${JSON.stringify(savingsAdvice)}`
        )
        channel.ack(msg)
      }
    })

    console.log(`Waiting for categorized expenses. To exit press CTRL+C`)
  } catch (error) {
    console.error("Failed to start the savings expert:", error)
  }
}

function analyzeExpenseForSavings(expense: any): any {
  // Placeholder logic for savings analysis
  // In a real-world scenario, you would implement more complex logic
  const advice = {
    expenseId: expense.id,
    advice: "Consider switching to a cheaper service provider.",
  }
  return advice
}

start()
