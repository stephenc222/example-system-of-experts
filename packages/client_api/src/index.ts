import WebSocket from "ws"
import * as path from "path"
import http from "http"
import amqp from "amqplib"
import express from "express"

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

const RABBITMQ_URL = `amqp://${process.env.RABBITMQ_USERNAME}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}`
const MANAGER_QUEUE = "manager_queue"
const CLIENT_QUEUE = "client_queue"

app.get("/status", (request, response) => {
  return response.send("OK")
})

// Serve static files from the 'public' directory where 'index.html' is located
app.use(express.static(path.join(__dirname, "..", "public")))

// Function to send messages to the manager queue
async function sendMessageToQueue(queueName: string, content: object) {
  const conn = await amqp.connect(RABBITMQ_URL)
  const channel = await conn.createChannel()
  await channel.assertQueue(queueName, { durable: false })
  channel.sendToQueue(queueName, Buffer.from(JSON.stringify(content)))
  await channel.close()
  await conn.close()
}

wss.on("connection", async (ws) => {
  console.log("Client connected")

  const conn = await amqp.connect(RABBITMQ_URL)
  const channel = await conn.createChannel()
  await channel.assertQueue(MANAGER_QUEUE, { durable: false })
  // Handle incoming messages from the manager queue
  await channel.assertQueue(CLIENT_QUEUE, { durable: false })
  ws.on("message", async (data: string) => {
    const payload = JSON.parse(data)
    console.log("CLIENT API RECEIVED MESSAGE:", JSON.stringify({ payload }))

    // Forward the message to the manager queue
    await sendMessageToQueue(MANAGER_QUEUE, payload)
  })
  channel.consume(
    CLIENT_QUEUE,
    (msg) => {
      if (msg) {
        ws.send(msg.content.toString()) // Send the message back to the client
        channel.ack(msg)
      }
    },
    { noAck: false }
  )
  ws.on("close", () => {
    console.log("Client disconnected")
    channel.close() // Close the RabbitMQ channel when the WebSocket disconnects
  })
})

server.listen(3000, () => {
  console.log("Server started on port 3000")
})
