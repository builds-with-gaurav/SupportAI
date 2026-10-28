from pathlib import Path

import joblib
import pandas as pd

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline


BASE_DIR = Path(__file__).resolve().parent

DATA_PATH = BASE_DIR / "data" / "ticket_dataset.csv"
MODEL_DIR = BASE_DIR / "models"

MODEL_DIR.mkdir(exist_ok=True)


# Load dataset
df = pd.read_csv(DATA_PATH)

print(f"Loaded {len(df)} training examples")


def train_model(target_column):
    X = df["text"]
    y = df[target_column]

    model = Pipeline([
        (
            "tfidf",
            TfidfVectorizer(
                lowercase=True,
                ngram_range=(1, 2)
            )
        ),
        (
            "classifier",
            LogisticRegression(
                max_iter=1000
            )
        )
    ])

    model.fit(X, y)

    output_path = MODEL_DIR / f"{target_column}_model.joblib"

    joblib.dump(model, output_path)

    print(
        f"Saved {target_column} model -> {output_path}"
    )


train_model("category")
train_model("priority")
train_model("sentiment")
train_model("intent")


print("All AI models trained successfully!")