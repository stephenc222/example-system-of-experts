# Example System of Experts

This example project demonstrates how AI Assistants, running in separate docker containers, can make decisions on how to communicate both with each other and end users, implemented for a simple "Personal Financial Assistant" system of experts.

For a detailed overview and explanation of this system of experts, check out my [companion blog post](https://stephencollins.tech/posts/how-to-build-a-system-of-experts-with-llms).

## Prerequisites

You need an [OpenAI](https://platform.openai.com/api-keys) API key and a free demo API key from [Cohere](https://cohere.com/) by creating a free account.

Create a `.env` file at the root of this repo, replacing the following with your own API keys:

```shell
RABBITMQ_HOST=rabbitmq
RABBITMQ_USERNAME=user
RABBITMQ_PASSWORD=password
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
COHERE_API_KEY=YOUR_COHERE_API_KEY
```

You also need to have [Docker Compose](https://docs.docker.com/compose/install/) installed as well.

## Getting Started

To start this example project, from the root of this repository just:

```shell
docker compose up --build
```

Once all AI expert docker containers have finished connecting to RabbitMQ, go to `http://localhost:3000` for a minimal chat web app, demonstrating how the experts can communicate with each other to accomplish a task. This can take between 15-30 seconds for all experts to fully connect.
