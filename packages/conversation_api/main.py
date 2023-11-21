from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
import json
import sqlite3
import os

app = FastAPI()
DATABASE_FILE = "conversation.db"

# Initialize the database


def initialize_database():
    init_sql_path = os.path.join(os.path.dirname(__file__), "init.sql")
    try:
        with open(init_sql_path, "r") as f:
            sql = f.read()
        with sqlite3.connect(DATABASE_FILE) as conn:
            cursor = conn.cursor()
            cursor.executescript(sql)
            conn.commit()
        print("Successfully executed init.sql")
    except Exception as e:
        print("Error reading or executing init.sql file", e)


initialize_database()

# Helper function to get the database connection


def get_db_connection():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row  # Enables name-based access to columns
    return conn


@app.post("/assistants")
async def create_assistant(request: Request):
    data = await request.json()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO assistants (instructions, assistant_name) VALUES (?, ?)",
                   (data['instructions'], data['name']))
    conn.commit()
    assistant_id = cursor.lastrowid
    conn.close()
    return JSONResponse(content={"id": assistant_id}, status_code=status.HTTP_201_CREATED)


@app.get("/assistants/{assistant_id}")
async def read_assistant(assistant_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM assistants WHERE id = ?", (assistant_id,))
    assistant = cursor.fetchone()
    conn.close()
    if assistant:
        return assistant
    raise HTTPException(status_code=404, detail="Assistant not found")


@app.post("/conversations")
async def create_conversation():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO conversations DEFAULT VALUES")
    conn.commit()
    conversation_id = cursor.lastrowid
    conn.close()
    return JSONResponse(content={"id": conversation_id}, status_code=status.HTTP_201_CREATED)


@app.get("/conversations/{conversation_id}")
async def read_conversation(conversation_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM conversations WHERE id = ?",
                   (conversation_id,))
    conversation = cursor.fetchone()
    conn.close()
    if conversation:
        return conversation
    raise HTTPException(status_code=404, detail="Conversation not found")


@app.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM conversations WHERE id = ?",
                   (conversation_id,))
    conn.commit()
    deleted = cursor.rowcount
    conn.close()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return JSONResponse(content={"detail": "Conversation deleted"}, status_code=status.HTTP_200_OK)


@app.post("/conversations/{conversation_id}/messages")
async def add_message(conversation_id: str, request: Request):
    data = await request.json()
    print("REQUEST INCOMING JSON DATA")
    print(json.dumps(data))
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM conversations WHERE thread_id = ?",
                   (conversation_id,))
    conversation = cursor.fetchone()
    if not conversation:
        cursor.execute("INSERT INTO conversations (thread_id) VALUES (?)",
                       (conversation_id,))
        conn.commit()
    cursor.execute("INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)",
                   (conversation_id, data['assistantId'] if 'assistantId' in data else 'USER', json.dumps(data['message'])))
    conn.commit()
    message_id = cursor.lastrowid
    conn.close()
    return JSONResponse(content={"id": message_id}, status_code=status.HTTP_201_CREATED)


@app.get("/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM messages WHERE conversation_id = ?", (conversation_id,))
    messages = cursor.fetchall()
    conn.close()
    return [dict(message) for message in messages]  # Convert rows to dicts
