from flask import Flask, render_template, send_file

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/geojson")
def geojson():
    return send_file(
        "data/BunkerLayer.geojson",
        mimetype="application/geo+json"
    )


if __name__ == "__main__":
    app.run(debug=True)
