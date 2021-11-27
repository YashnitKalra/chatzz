import pandas as pd
from datetime import datetime
from nltk.sentiment.vader import SentimentIntensityAnalyzer

def getDateTime(timestamp):
    d = datetime.fromtimestamp(timestamp//1000)
    return d.date(), d.time()

def getSentiment(data):
    new_data = [[m["message"], *getDateTime(m["timestamp"])] for m in data]

    df = pd.DataFrame(new_data, columns = ["message", "date", "time"])
    df['date'] = pd.to_datetime(df['date'])

    df["Positive"] = [sentiments.polarity_scores(i)["pos"] for i in df["message"]]
    df["Negative"] = [sentiments.polarity_scores(i)["neg"] for i in df["message"]]
    df["Neutral"] = [sentiments.polarity_scores(i)["neu"] for i in df["message"]]

    x = sum(df['Positive'])
    y = sum(df['Negative'])
    z = sum(df['Neutral'])

    if x>y and x>z:
        return "1"
    elif y>z and y>x:
        return "-1"
    else:
        return "0"

sentiments = SentimentIntensityAnalyzer()

# *************************************************************************************
# Flask

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
cors = CORS(app, resources = {"/": {"origins": "*"}})

@app.route('/', methods=['POST'])
def home():
    data = request.get_json()['data']
    response = jsonify({"sentiment": getSentiment(data)})
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "*")
    response.headers.add("Access-Control-Allow-Methods", "*")
    return response

app.run(debug=False)