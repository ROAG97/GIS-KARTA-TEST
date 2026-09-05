from flask import Flask, render_template, send_file, abort
import json

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


@app.route("/varn/<nr>")
def varn(nr):

    # Läs kartdatan
    with open("data/BunkerLayer.geojson", "r", encoding="utf-8") as file:
        geojson_data = json.load(file)

    vald_varn = None

    for feature in geojson_data["features"]:
        properties = feature["properties"]

        if str(properties.get("Nr")) == str(nr):
            vald_varn = feature
            break


    # Om numret inte finns i GeoJSON
    if vald_varn is None:
        abort(404)


    # Läs den fördjupade informationen
    with open("data/varn.json", "r", encoding="utf-8") as file:
        varn_data = json.load(file)


    # Hämta detaljinfo för exempelvis "683"
    detaljinfo = varn_data.get(str(nr), {})


    return render_template(
        "varn.html",
        varn=vald_varn,
        detaljinfo=detaljinfo
    )


if __name__ == "__main__":
    app.run(debug=True)
