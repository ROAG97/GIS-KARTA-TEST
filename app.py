import os
import json
import sqlite3
import re
import secrets

from functools import wraps

git add .
git commit -m "Fix secret key"
git push

from flask import (
    Flask,
    render_template,
    send_file,
    abort,
    jsonify,
    request,
    redirect,
    url_for,
    session
)

from werkzeug.security import check_password_hash

from auth import create_user_table

from database import create_database, sync_geojson_to_database

app = Flask(__name__)

# =================================
# SESSION / SECRET KEY
# =================================

secret_key = os.environ.get(
    "SECRET_KEY"
)

if not secret_key:

    secret_file = ".secret_key"

    if os.path.exists(secret_file):

        with open(
            secret_file,
            "r",
            encoding="utf-8"
        ) as file:

            secret_key = file.read().strip()

    else:

        secret_key = secrets.token_hex(32)

        with open(
            secret_file,
            "w",
            encoding="utf-8"
        ) as file:

            file.write(secret_key)


app.secret_key = secret_key

create_database()
sync_geojson_to_database()
create_user_table()

def get_db_connection():
    connection = sqlite3.connect("data/varn.db")
    connection.row_factory = sqlite3.Row
    return connection

# =================================
# LOGIN
# =================================

def login_required(function):

    @wraps(function)
    def decorated_function(
        *args,
        **kwargs
    ):

        if "user_id" not in session:

            return redirect(
                url_for(
                    "admin_login"
                )
            )

        return function(
            *args,
            **kwargs
        )

    return decorated_function

# =================================
# ADMIN LOGIN
# =================================

@app.route(
    "/admin/login",
    methods=["GET", "POST"]
)
def admin_login():

    error = None


    if request.method == "POST":

        username = request.form.get(
            "username",
            ""
        ).strip().lower()

        password = request.form.get(
            "password",
            ""
        )


        connection = get_db_connection()

        user = connection.execute(
            """
            SELECT *
            FROM users
            WHERE username = ?
            AND active = 1
            """,
            (username,)
        ).fetchone()

        connection.close()


        if (
            user
            and
            check_password_hash(
                user["password_hash"],
                password
            )
        ):

            session.clear()

            session["user_id"] = user["id"]
            session["username"] = user["username"]
            session["role"] = user["role"]

            return redirect(
                url_for(
                    "admin"
                )
            )


        error = (
            "Fel användarnamn eller lösenord."
        )


    return render_template(
        "admin_login.html",
        error=error
    )


# =================================
# ADMIN LOGOUT
# =================================

@app.route(
    "/admin/logout",
    methods=["POST"]
)
def admin_logout():

    session.clear()

    return redirect(
        url_for(
            "admin_login"
        )
    )

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
# DRAKTÄNDER
# =================================

@app.route("/draktander")
def draktander():

    file_path = "data/draktander.geojson"

    if not os.path.exists(file_path):
        abort(404)

    return send_file(
        file_path,
        mimetype="application/geo+json"
    )


# =================================
# LFV DRÖNARKARTA
# =================================

@app.route("/lfv")
def lfv():

    file_path = "data/lfv_dronarkarta.geojson"

    if not os.path.exists(file_path):
        abort(404)

    return send_file(
        file_path,
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


@app.route("/varn/<nr>")
def varn(nr):
    # =========================
    # 1. HÄMTA GIS-DATA
    # =========================

    with open(
        "data/BunkerLayer.geojson",
        "r",
        encoding="utf-8"
    ) as file:
        geojson_data = json.load(file)

    valt_varn = None

    for feature in geojson_data["features"]:
        properties = feature.get("properties", {})

        if str(properties.get("Nr")) == str(nr):
            valt_varn = feature
            break

    if valt_varn is None:
        abort(404)


    # =========================
    # 2. HÄMTA DATA FRÅN SQLITE
    # =========================

    connection = get_db_connection()

    detaljinfo = connection.execute(
        """
        SELECT *
        FROM varn
        WHERE nr = ?
        """,
        (str(nr),)
    ).fetchone()

    connection.close()


    # =========================
    # 3. OM POST SAKNAS
    # =========================

    if detaljinfo is None:
        detaljinfo = {}
    else:
        detaljinfo = dict(detaljinfo)


    # Standardvärden så varn.html inte kraschar
    detaljinfo.setdefault("rubrik", "")
    detaljinfo.setdefault("variant", "")
    detaljinfo.setdefault("byggar", "")
    detaljinfo.setdefault("historik", "")
    detaljinfo.setdefault("parkering", "")
    detaljinfo.setdefault("tillganglighet", "")
    detaljinfo.setdefault("plomberad", "")
    detaljinfo.setdefault("modell", "")
    detaljinfo.setdefault("bilder", [])
    detaljinfo.setdefault("dokument", [])


    # =========================
    # 4. SKICKA TILL HTML
    # =========================

    return render_template(
        "varn.html",
        varn=valt_varn,
        detaljinfo=detaljinfo
    )

# =================================
# ADMIN STARTSIDA
# =================================

@app.route("/admin")
@login_required
def admin():

    with open(
        "data/BunkerLayer.geojson",
        "r",
        encoding="utf-8"
    ) as file:
        geojson_data = json.load(file)

    varn_lista = []

    for feature in geojson_data.get("features", []):

        properties = feature.get(
            "properties",
            {}
        )

        nr = properties.get("Nr")
        typ = properties.get("Typ")
        variant = properties.get("Variant")
        status = properties.get("Status")

        if not nr:
            continue

        varn_lista.append({
            "nr": str(nr),
            "typ": typ or "",
            "variant": variant or "",
            "status": status or ""
        })


    # Naturlig nummersortering
    def sort_key(item):
        nr = item["nr"]

        match = re.match(
            r"(\d+)(.*)",
            nr
        )

        if match:
            return (
                int(match.group(1)),
                match.group(2)
            )

        return (
            999999,
            nr
        )


    varn_lista.sort(
        key=sort_key
    )


    return render_template(
        "admin.html",
        varn_lista=varn_lista
    )

# =================================
# REDIGERA VÄRN
# =================================

@app.route("/admin/varn/<nr>/edit", methods=["GET", "POST"])
@login_required
def edit_varn(nr):

    # -----------------------------
    # Kontrollera att värnet finns
    # i GeoJSON
    # -----------------------------

    with open(
        "data/BunkerLayer.geojson",
        "r",
        encoding="utf-8"
    ) as file:

        geojson_data = json.load(file)


    valt_varn = None


    for feature in geojson_data.get("features", []):

        properties = feature.get(
            "properties",
            {}
        )

        if str(properties.get("Nr")) == str(nr):

            valt_varn = feature

            break


    if valt_varn is None:
        abort(404)


    connection = get_db_connection()


    # -----------------------------
    # SPARA ÄNDRINGAR
    # -----------------------------

    if request.method == "POST":



        byggar = request.form.get(
            "byggar",
            ""
        ).strip()

        historik = request.form.get(
            "historik",
            ""
        ).strip()

        parkering = request.form.get(
            "parkering",
            ""
        ).strip()

        tillganglighet = request.form.get(
            "tillganglighet",
            ""
        ).strip()

        plomberad = request.form.get(
            "plomberad",
            ""
        ).strip()


        # -----------------------------
        # SKETCHFAB / 3D-MODELL
        # -----------------------------

        modell_input = request.form.get(
            "modell",
            ""
        ).strip()


        modell = modell_input


        # Om hela iframe/embed-koden
        # klistras in
        if "<iframe" in modell_input.lower():

            match = re.search(
                r'src=["\']([^"\']+)["\']',
                modell_input,
                re.IGNORECASE
            )

            if match:
                modell = match.group(1)


        # -----------------------------
        # SPARA I SQLITE
        # -----------------------------

        connection.execute(
            """
INSERT INTO varn (
    nr,
    byggar,
    historik,
    parkering,
    tillganglighet,
    plomberad,
    modell
)

VALUES (?, ?, ?, ?, ?, ?, ?)

ON CONFLICT(nr)
DO UPDATE SET

    byggar = excluded.byggar,
    historik = excluded.historik,
    parkering = excluded.parkering,
    tillganglighet = excluded.tillganglighet,
    plomberad = excluded.plomberad,
    modell = excluded.modell
            """,
            (
 (
    str(nr),
    byggar,
    historik,
    parkering,
    tillganglighet,
    plomberad,
    modell
)
            )
        )

        connection.commit()
        connection.close()


        return redirect(
            url_for(
                "varn",
                nr=nr
            )
        )


    # -----------------------------
    # HÄMTA BEFINTLIG INFORMATION
    # -----------------------------

    detaljinfo = connection.execute(
        """
        SELECT *
        FROM varn
        WHERE nr = ?
        """,
        (str(nr),)
    ).fetchone()

    connection.close()


    if detaljinfo is None:

        detaljinfo = {
            "variant": "",
            "byggar": "",
            "historik": "",
            "parkering": "",
            "tillganglighet": "",
            "plomberad": "",
            "modell": ""
        }

    else:

        detaljinfo = dict(detaljinfo)


    return render_template(
        "admin_edit_varn.html",
        varn=valt_varn,
        detaljinfo=detaljinfo
    )
# =================================
# STARTA FLASK
# =================================

if __name__ == "__main__":
    app.run(debug=True)
