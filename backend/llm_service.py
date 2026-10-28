import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is not set in the .env file")

client = Groq(api_key=GROQ_API_KEY)

MODEL_NAME = "openai/gpt-oss-20b"


def generate_support_response(
    title,
    description,
    category,
    priority,
    sentiment,
    intent
):
    prompt = f"""
You are an AI customer support assistant for SupportAI.

Create a professional, helpful and concise response
to the following customer support ticket.

Ticket Title:
{title}

Customer Message:
{description}

Category:
{category}

Priority:
{priority}

Sentiment:
{sentiment}

Intent:
{intent}

Rules:
1. Be polite and empathetic.
2. Understand the customer's actual problem.
3. Give practical next steps when possible.
4. Do not invent company policies.
5. Do not claim an action was completed unless confirmed.
6. Keep the response concise.
7. Do not mention that you are an AI.
8. Return only the customer-facing response.

Customer Response:
"""

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": "You are a professional customer support assistant."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.3,
        max_tokens=300
    )

    return response.choices[0].message.content.strip()