import os
import json

from flask import (
    Flask,
    render_template,
    send_file,
    abort,
    jsonify
)

app = Flask(__name__)


# =================================
# STARTSIDA
# =================================

@app.route("/")
def index():
    return render_template("index.html")


# =================================
# GEOJSON
# =================================

@app.route("/geojson")
def geojson():

    return send_file(
        "data/BunkerLayer.geojson",
        mimetype="application/geo+json"
    )


# =================================
# IKONLISTA
# =================================

@app.route("/icons")
def icons():

    icon_folder = os.path.join(
        app.static_folder,
        "icons"
    )

    if not os.path.exists(icon_folder):
        return jsonify([])

    files = os.listdir(icon_folder)

    svg_icons = [
        os.path.splitext(filename)[0]
        for filename in files
        if filename.lower().endswith(".svg")
    ]

    return jsonify(svg_icons)


# =================================
# VÄRNSIDA
# =================================

@app.route("/varn/<nr>")
def varn(nr):

    # -----------------------------
    # Läs GeoJSON
    # -----------------------------

    with open(
        "data/BunkerLayer.geojson",
        "r",
        encoding="utf-8"
    ) as file:

        geojson_data = json.load(file)


    valt_varn = None


    # -----------------------------
    # Leta upp rätt värn
    # -----------------------------

    for feature in geojson_data["features"]:

        properties = feature.get(
            "properties",
            {}
        )

        if str(properties.get("Nr")) == str(nr):

            valt_varn = feature

            break


    # Finns inte värnet → 404

    if valt_varn is None:
        abort(404)


    # -----------------------------
    # Läs fördjupad värninfo
    # -----------------------------

    varn_file = "data/varn.json"

    detaljinfo = {}


    if os.path.exists(varn_file):

        with open(
            varn_file,
            "r",
            encoding="utf-8"
        ) as file:

            varn_data = json.load(file)


        detaljinfo = varn_data.get(
            str(nr),
            {}
        )


    # -----------------------------
    # Skicka till varn.html
    # -----------------------------

    return render_template(
        "varn.html",
        varn=valt_varn,
        detaljinfo=detaljinfo
    )


# =================================
# STARTA FLASK
# =================================

if __name__ == "__main__":
    app.run(debug=True)
