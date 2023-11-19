import * as amqp from "amqplib"
import { MessageProcessor } from "./types"
import { sleep } from "./util"

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "rabbitmq"
const RABBITMQ_USERNAME = process.env.RABBITMQ_USERNAME || "guest"
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || "guest"
const RABBITMQ_URL = `amqp://${RABBITMQ_USERNAME}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}`

export default class Consumer {
  private channel: amqp.Channel | null = null

  constructor(
    private queueName: string,
    private messageProcessor: MessageProcessor
  ) {}

  private async connectWithRetry(
    rabbitMQUrl: string,
    retries: number = 5,
    interval: number = 20000
  ): Promise<amqp.Connection> {
    let lastError: unknown

    for (let i = 0; i < retries; i++) {
      try {
        await sleep(interval)
        return await amqp.connect(rabbitMQUrl)
      } catch (error) {
        lastError = error
        console.error(
          `Failed to connect to RabbitMQ (attempt ${i + 1}/${retries})`
        )
      }
    }

    throw lastError
  }

  async connect(rabbitMQUrl = RABBITMQ_URL): Promise<void> {
    const connection = await this.connectWithRetry(rabbitMQUrl)
    this.channel = await connection.createChannel()
    await this.channel.assertQueue(this.queueName, { durable: false })
  }

  async startConsuming(): Promise<void> {
    if (!this.channel) {
      throw new Error(
        "Cannot consume without a connection. Call connect first."
      )
    }

    this.channel.consume(this.queueName, async (msg) => {
      if (msg) {
        try {
          const payload = JSON.parse(msg.content.toString())
          const nextMessage = await this.messageProcessor.process(payload)
          // NOTE: this is a simple implementation using direct queues.
          this.channel?.assertQueue(nextMessage.queue, { durable: false })
          this.channel?.sendToQueue(
            nextMessage.queue,
            Buffer.from(
              JSON.stringify({ ...nextMessage, threadId: payload.threadId })
            )
          )
          this.channel?.ack(msg)
        } catch (error) {
          console.error("Error processing message:", error)
          this.channel?.nack(msg)
        }
      }
    })
    console.log(`Consuming from ${this.queueName}. To exit press CTRL+C`)
  }
}
