from pathlib import Path

import joblib


BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"


category_model = joblib.load(
    MODEL_DIR / "category_model.joblib"
)

priority_model = joblib.load(
    MODEL_DIR / "priority_model.joblib"
)

sentiment_model = joblib.load(
    MODEL_DIR / "sentiment_model.joblib"
)

intent_model = joblib.load(
    MODEL_DIR / "intent_model.joblib"
)


def analyze_ticket(text: str):

    category = category_model.predict([text])[0]

    priority = priority_model.predict([text])[0]

    sentiment = sentiment_model.predict([text])[0]

    intent = intent_model.predict([text])[0]

    return {
        "category": category,
        "priority": priority,
        "sentiment": sentiment,
        "intent": intent
    }