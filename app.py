import os
import json
import re
import secrets
import time
import io
import boto3

from PIL import Image, ImageOps
from dotenv import load_dotenv

from functools import wraps

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

from database import (
    create_database,
    sync_geojson_to_database,
    get_db_connection
)

app = Flask(__name__)
load_dotenv()


# =================================
# CLOUDFLARE R2
# =================================

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL")


r2_client = boto3.client(
    "s3",
    endpoint_url=(
        f"https://{R2_ACCOUNT_ID}"
        ".r2.cloudflarestorage.com"
    ),
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name="auto"
)


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


# =================================
# VISNINGSNAMN FÖR VÄRNTYPER
#
# QGIS-värde -> namn på webbsidan
#
# LÄGG TILL NYA TYPER HÄR
# =================================

VARN_TYPE_NAMES = {
    "SV": "Stadsvärn",
    "SSP": "Sammanställningsplats",
    "SPKU": "Splitterkur",
    "SP": "Strålkastarplattform",
    "SK": "Skyddsrum",
    "S-PLATS": "Sammanställningsplats",
    "PV": "Pansarvärn",
    "PROV": "Provisoriskt",
    "PJV": "Pjäsvärn",
    "Okänd": "Okänd",
    "OBS": "Observationsvärn",
    "MS": "Mätstation",
    "LV": "Luftvärn",
    "LC": "Ledningscentral",
    "KV": "Kanonvärn",

    "KSP": "Kulsprutevärn",
    "KSP I": "Kulsprutevärn I",
    "KSP II": "Kulsprutevärn II",
    "KSP III": "Kulsprutevärn III",
    "KSP IV": "Kulsprutevärn IV",
    "KSP V": "Kulsprutevärn V",
    "KSP VII": "Kulsprutevärn VII",

    "Kg-hatt": "Kulsprutegevär-hatt",
    "KG": "Kulsprutegevär",
    "KG I": "Kulsprutegevär I",
    "KG III": "Kulsprutegevär III",

    "KA": "Kustartilleri",
    "FV": "Fastighetsvärn",
    "ES": "Eldställning"
}


def get_varn_type_name(type_name):

    if not type_name:
        return "Okänd"

    return VARN_TYPE_NAMES.get(
        type_name,
        type_name
    )
# =================================
# ÄNDRINGSLOGG
# =================================



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
# BILDUPPLADDNING TILL R2
# =================================

def upload_database_image(image_file, slug):

    image = Image.open(image_file)

    # Korrigera rotation från exempelvis mobilbilder
    image = ImageOps.exif_transpose(image)

    # Konvertera till lämpligt färgläge
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")

    # Max 3000 px på längsta sidan
    image.thumbnail(
        (3000, 3000),
        Image.Resampling.LANCZOS
    )

    # Skapa WebP i minnet
    output = io.BytesIO()

    image.save(
        output,
        format="WEBP",
        quality=92,
        method=6
    )

    output.seek(0)

    # Plats i R2
    object_key = (
        f"databas/{slug}/huvudbild.webp"
    )

    # Ladda upp till R2
    r2_client.upload_fileobj(
        output,
        R2_BUCKET_NAME,
        object_key,
        ExtraArgs={
            "ContentType": "image/webp"
        }
    )

    # Returnera publik URL
    return (
        f"{R2_PUBLIC_URL.rstrip('/')}/"
        f"{object_key}"
    )

def get_r2_image_library():

    images = []

    continuation_token = None

    while True:

        params = {
            "Bucket": R2_BUCKET_NAME,
            "MaxKeys": 1000
        }

        if continuation_token:
            params["ContinuationToken"] = continuation_token

        response = r2_client.list_objects_v2(
            **params
        )

        for item in response.get("Contents", []):

            key = item["Key"]

            if key.endswith("/"):
                continue

            if not key.lower().endswith(
                (".jpg", ".jpeg", ".png", ".webp")
            ):
                continue

            images.append({
                "key": key,
                "url": (
                    f"{R2_PUBLIC_URL.rstrip('/')}/"
                    f"{key}"
                ),
                "size": item["Size"],
                "modified": item["LastModified"]
            })

        if not response.get("IsTruncated"):
            break

        continuation_token = response.get(
            "NextContinuationToken"
        )

    images.sort(
        key=lambda image: image["modified"],
        reverse=True
    )

    return images

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
            WHERE username = %s
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
# DATABAS
# =================================

@app.route("/databas")
def databas():

    connection = get_db_connection()

    posts = connection.execute(
        """
        SELECT
            slug,
            title,
            category,
            description,
            image_url
        FROM database_posts
        WHERE published = TRUE
        ORDER BY title
        """
    ).fetchall()

    connection.close()

    posts = [
        dict(post)
        for post in posts
    ]

    return render_template(
        "databas.html",
        posts=posts
    )
@app.route("/databas/<slug>")
def databas_post(slug):

    connection = get_db_connection()

    post = connection.execute(
        """
        SELECT *
        FROM database_posts
        WHERE slug = %s
        AND published = TRUE
        """,
        (slug,)
    ).fetchone()


    if post is None:

        connection.close()

        abort(404)


    # =================================
    # FAKTARADER
    # =================================

    facts = connection.execute(
        """
        SELECT
            label,
            value
        FROM database_post_facts
        WHERE post_id = %s
        ORDER BY sort_order, id
        """,
        (post["id"],)
    ).fetchall()


    # =================================
    # BILDGALLERI
    # =================================

    gallery_images = connection.execute(
        """
        SELECT
            id,
            image_url,
            caption,
            sort_order
        FROM database_post_images
        WHERE post_id = %s
        ORDER BY sort_order, id
        """,
        (post["id"],)
    ).fetchall()


    connection.close()


    post = dict(post)

    facts = [
        dict(fact)
        for fact in facts
    ]

    gallery_images = [
        dict(image)
        for image in gallery_images
    ]


    return render_template(
        "databas_post.html",
        post=post,
        facts=facts,
        gallery_images=gallery_images
    )

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
    start_total = time.perf_counter()
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

    after_geojson = time.perf_counter()

    # =========================
    # 2. NEON
    #
    # Samma anslutning används
    # både för visningsstatistik
    # och värnets information.
    # =========================

    before_neon = time.perf_counter()
    connection = get_db_connection()
    after_connect = time.perf_counter()

    # -------------------------
    # Registrera visning
    # -------------------------

    if session.get("user_id"):

        connection.execute(
            """
            INSERT INTO admin_varn_views (
                varn_nr,
                username
            )
            VALUES (%s, %s)
            """,
            (
                str(nr),
                session.get("username")
            )
        )

    else:

        connection.execute(
            """
            INSERT INTO varn_views (
                varn_nr
            )
            VALUES (%s)
            """,
            (str(nr),)
        )


    after_insert = time.perf_counter()


    # -------------------------
    # Hämta värnets information
    # -------------------------

    detaljinfo = connection.execute(
        """
        SELECT *
        FROM varn
        WHERE nr = %s
        """,
        (str(nr),)
    ).fetchone()


    after_select = time.perf_counter()


     # -------------------------
    # Spara statistik och stäng
    # -------------------------

    connection.commit()
    connection.close()


    after_database = time.perf_counter()

    total_time = (
        after_database
        - start_total
    )

    if total_time > 2.0:

        print(
            "[SLOW REQUEST] "
            f"Värn {nr} | "
            f"Total: {total_time:.3f}s"
        )


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
      detaljinfo=detaljinfo,
      variant_namn=get_varn_type_name(
          valt_varn["properties"].get("Variant")
    )
)

# =================================
# ADMIN - DATABAS
# =================================

@app.route("/admin/databas")
@login_required
def admin_databas():

    connection = get_db_connection()

    posts = connection.execute(
        """
        SELECT
            id,
            slug,
            title,
            category,
            published,
            updated_at
        FROM database_posts
        ORDER BY title
        """
    ).fetchall()

    connection.close()

    posts = [
        dict(post)
        for post in posts
    ]

    return render_template(
        "admin_databas.html",
        posts=posts
    )
# =================================
# ADMIN - NY DATABASPOST
# =================================

@app.route(
    "/admin/databas/ny",
    methods=["GET", "POST"]
)
@login_required
def admin_databas_new():

    if request.method == "POST":

        title = request.form.get(
            "title",
            ""
        ).strip()

        slug = request.form.get(
            "slug",
            ""
        ).strip().lower()

        category = request.form.get(
            "category",
            ""
        ).strip()

        image_url = request.form.get(
            "image_url",
            ""
        ).strip()

        main_image = request.files.get(
            "main_image"
        )

        description = request.form.get(
            "description",
            ""
        ).strip()

        intro = request.form.get(
            "intro",
            ""
        ).strip()

        connection_text = request.form.get(
            "connection_text",
            ""
        ).strip()

        history = request.form.get(
            "history",
            ""
        ).strip()

        published = (
            request.form.get("published")
            == "on"
        )


        # =================================
        # HUVUDBILD
        # =================================

        if main_image and main_image.filename:

            image_url = upload_database_image(
                main_image,
                slug
            )


        connection = get_db_connection()

        new_post = connection.execute(
            """
            INSERT INTO database_posts (
                slug,
                title,
                category,
                description,
                image_url,
                intro,
                history,
                connection_text,
                published
            )
            VALUES (
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s
            )
            RETURNING id
            """,
            (
                slug,
                title,
                category,
                description or None,
                image_url or None,
                intro or None,
                history or None,
                connection_text or None,
                published
            )
        ).fetchone()


        post_id = new_post["id"]

        # =================================
        # SPARA FAKTARADER
        # =================================

        fact_labels = request.form.getlist(
            "fact_label[]"
        )

        fact_values = request.form.getlist(
            "fact_value[]"
        )


        for sort_order, (label, value) in enumerate(
            zip(fact_labels, fact_values),
            start=1
        ):

            label = label.strip()
            value = value.strip()

            if not label or not value:
                continue


            connection.execute(
                """
                INSERT INTO database_post_facts (
                    post_id,
                    label,
                    value,
                    sort_order
                )
                VALUES (%s, %s, %s, %s)
                """,
                (
                    post_id,
                    label,
                    value,
                    sort_order
                )
            )

        connection.commit()
        connection.close()

        return redirect(
            url_for("admin_databas")
        )


    return render_template(
        "admin_databas_form.html",
        post=None,
        facts=[],
        gallery_images=[],
        image_library=get_r2_image_library()
    )


@app.route(
    "/admin/databas/<int:post_id>/redigera",
    methods=["GET", "POST"]
)
@login_required
def admin_databas_edit(post_id):

    connection = get_db_connection()

    post = connection.execute(
        """
        SELECT *
        FROM database_posts
        WHERE id = %s
        """,
        (post_id,)
    ).fetchone()

    if post is None:

        connection.close()
        abort(404)

    if request.method == "POST":

        title = request.form.get(
            "title",
            ""
        ).strip()

        slug = request.form.get(
            "slug",
            ""
        ).strip().lower()

        category = request.form.get(
            "category",
            ""
        ).strip()

        image_url = request.form.get(
            "image_url",
            ""
        ).strip()

        main_image = request.files.get(
            "main_image"
        )

        description = request.form.get(
            "description",
            ""
        ).strip()

        intro = request.form.get(
            "intro",
            ""
        ).strip()

        connection_text = request.form.get(
            "connection_text",
            ""
        ).strip()

        history = request.form.get(
            "history",
            ""
        ).strip()

        published = (
            request.form.get("published")
            == "on"
        )

        # =================================
        # NY HUVUDBILD
        # =================================

        if main_image and main_image.filename:

            image_url = upload_database_image(
                main_image,
                slug
            )

        # =================================
        # UPPDATERA DATABASPOST
        # =================================

        connection.execute(
            """
            UPDATE database_posts
            SET
                slug = %s,
                title = %s,
                category = %s,
                description = %s,
                image_url = %s,
                intro = %s,
                history = %s,
                connection_text = %s,
                published = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (
                slug,
                title,
                category,
                description or None,
                image_url or None,
                intro or None,
                history or None,
                connection_text or None,
                published,
                post_id
            )
        )

        # =================================
        # SPARA FAKTARADER
        # =================================

        fact_labels = request.form.getlist(
            "fact_label[]"
        )

        fact_values = request.form.getlist(
            "fact_value[]"
        )

        # =================================
        # HÄMTA GALLERIBILDER FRÅN FORMULÄRET
        # =================================

        gallery_urls = request.form.getlist(
            "gallery_image_url[]"
        )

        gallery_captions = request.form.getlist(
            "gallery_caption[]"
        )

        connection.execute(
            """
            DELETE FROM database_post_facts
            WHERE post_id = %s
            """,
            (post_id,)
        )

        for sort_order, (label, value) in enumerate(
            zip(fact_labels, fact_values),
            start=1
        ):

            label = label.strip()
            value = value.strip()

            if not label or not value:
                continue

            connection.execute(
                """
                INSERT INTO database_post_facts (
                    post_id,
                    label,
                    value,
                    sort_order
                )
                VALUES (%s, %s, %s, %s)
                """,
                (
                    post_id,
                    label,
                    value,
                    sort_order
                )
            )

        # =================================
        # SPARA BILDGALLERI
        # =================================

        connection.execute(
            """
            DELETE FROM database_post_images
            WHERE post_id = %s
            """,
            (post_id,)
        )


        for sort_order, (image_url, caption) in enumerate(
            zip(gallery_urls, gallery_captions),
            start=1
        ):

            image_url = image_url.strip()
            caption = caption.strip()

            if not image_url:
                continue


            connection.execute(
                """
                INSERT INTO database_post_images (
                    post_id,
                    image_url,
                    caption,
                    sort_order
                )
                VALUES (%s, %s, %s, %s)
                """,
                (
                    post_id,
                    image_url,
                    caption or None,
                    sort_order
                )
            )

        connection.commit()
        connection.close()

        return redirect(
            url_for("admin_databas")
        )

    # =================================
    # HÄMTA FAKTARADER FÖR FORMULÄRET
    # =================================

    facts = connection.execute(
        """
        SELECT
            id,
            label,
            value,
            sort_order
        FROM database_post_facts
        WHERE post_id = %s
        ORDER BY sort_order, id
        """,
        (post_id,)
    ).fetchall()

# =================================
# HÄMTA GALLERIBILDER
# =================================

    gallery_images = connection.execute(
        """
        SELECT
            id,
            image_url,
            caption,
            sort_order
        FROM database_post_images
        WHERE post_id = %s
        ORDER BY sort_order, id
        """,
        (post_id,)
    ).fetchall()

    connection.close()

    post = dict(post)

    facts = [
        dict(fact)
        for fact in facts
    ]

    return render_template(
        "admin_databas_form.html",
        post=post,
        facts=facts,
        gallery_images=gallery_images,
        image_library=get_r2_image_library()
    )

# =================================
# ADMIN - RADERA DATABASPOST
# =================================

@app.route(
    "/admin/databas/<int:post_id>/radera",
    methods=["POST"]
)
@login_required
def admin_databas_delete(post_id):

    connection = get_db_connection()

    post = connection.execute(
        """
        SELECT title
        FROM database_posts
        WHERE id = %s
        """,
        (post_id,)
    ).fetchone()


    if post is None:

        connection.close()

        abort(404)


    connection.execute(
        """
        DELETE FROM database_posts
        WHERE id = %s
        """,
        (post_id,)
    )

    connection.commit()
    connection.close()


    return redirect(
        url_for("admin_databas")
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
# STATISTIK
# =================================

@app.route("/admin/statistik")
@login_required
def admin_statistik():

    connection = get_db_connection()

    # =================================
    # SKAPARSTATISTIK
    # =================================

    creators = connection.execute(
        """
        SELECT
            username,
            COUNT(*) AS antal_andringar,
            COUNT(DISTINCT varn_nr) AS antal_varn,
            MAX(changed_at) AS senaste_aktivitet
        FROM change_log
        GROUP BY username
        ORDER BY antal_andringar DESC
        """
    ).fetchall()


    field_stats = connection.execute(
        """
        SELECT
            username,
            field_name,
            COUNT(*) AS antal
        FROM change_log
        GROUP BY username, field_name
        ORDER BY username, antal DESC
        """
    ).fetchall()


    totals = connection.execute(
        """
        SELECT
            COUNT(*) AS antal_andringar,
            COUNT(DISTINCT varn_nr) AS antal_varn,
            COUNT(DISTINCT username) AS antal_skapare
        FROM change_log
        """
    ).fetchone()


    # =================================
    # DATABASSTATUS
    # =================================

    database_stats = connection.execute(
        """
        SELECT
            COUNT(*) AS totalt,

            COUNT(*) FILTER (
                WHERE NULLIF(TRIM(historik), '') IS NOT NULL
            ) AS historik,

            COUNT(*) FILTER (
                WHERE NULLIF(TRIM(byggar), '') IS NOT NULL
            ) AS byggar,

            COUNT(*) FILTER (
                WHERE NULLIF(TRIM(parkering), '') IS NOT NULL
            ) AS parkering,

            COUNT(*) FILTER (
                WHERE NULLIF(TRIM(tillganglighet), '') IS NOT NULL
            ) AS tillganglighet,

            COUNT(*) FILTER (
                WHERE NULLIF(TRIM(plomberad), '') IS NOT NULL
            ) AS plomberad,

            COUNT(*) FILTER (
                WHERE NULLIF(TRIM(modell), '') IS NOT NULL
            ) AS modell,

            COUNT(*) FILTER (
                WHERE
                    NULLIF(TRIM(historik), '') IS NULL
                    AND NULLIF(TRIM(byggar), '') IS NULL
                    AND NULLIF(TRIM(parkering), '') IS NULL
                    AND NULLIF(TRIM(tillganglighet), '') IS NULL
                    AND NULLIF(TRIM(plomberad), '') IS NULL
                    AND NULLIF(TRIM(modell), '') IS NULL
            ) AS ororda,

            COUNT(*) FILTER (
                WHERE
                    NULLIF(TRIM(historik), '') IS NOT NULL
                    OR NULLIF(TRIM(byggar), '') IS NOT NULL
                    OR NULLIF(TRIM(parkering), '') IS NOT NULL
                    OR NULLIF(TRIM(tillganglighet), '') IS NOT NULL
                    OR NULLIF(TRIM(plomberad), '') IS NOT NULL
                    OR NULLIF(TRIM(modell), '') IS NOT NULL
            ) AS paborjade

        FROM varn
        """
    ).fetchone()


    # =================================
    # MEST ARBETADE VÄRN
    # =================================

    most_edited = connection.execute(
        """
        SELECT
            varn_nr,
            COUNT(*) AS antal
        FROM change_log
        GROUP BY varn_nr
        ORDER BY antal DESC, varn_nr
        LIMIT 10
        """
    ).fetchall()

    # =================================
    # PUBLIK BESÖKARSTATISTIK
    # =================================

    visitor_stats = connection.execute(
        """
        SELECT
            COUNT(*) AS totalt,

            COUNT(*) FILTER (
                WHERE viewed_at >= CURRENT_DATE
            ) AS idag,

            COUNT(*) FILTER (
                WHERE viewed_at >= CURRENT_TIMESTAMP
                    - INTERVAL '7 days'
            ) AS sju_dagar,

            COUNT(*) FILTER (
                WHERE viewed_at >= CURRENT_TIMESTAMP
                    - INTERVAL '30 days'
            ) AS trettio_dagar

        FROM varn_views
        """
    ).fetchone()


    most_viewed_public = connection.execute(
        """
        SELECT
            varn_nr,
            COUNT(*) AS antal
        FROM varn_views
        GROUP BY varn_nr
        ORDER BY antal DESC, varn_nr
        LIMIT 10
        """
    ).fetchall()


    # =================================
    # BESÖK PER DAG – 30 DAGAR
    # =================================

    daily_visitors = connection.execute(
        """
        SELECT
            DATE(viewed_at) AS datum,
            COUNT(*) AS antal
        FROM varn_views
        WHERE viewed_at >= CURRENT_DATE
            - INTERVAL '29 days'
        GROUP BY DATE(viewed_at)
        ORDER BY datum
        """
    ).fetchall()


    # =================================
    # ROBERT / MATTEO – VISNINGAR
    # =================================

    admin_view_totals = connection.execute(
        """
        SELECT
            username,
            COUNT(*) AS totalt,
            COUNT(DISTINCT varn_nr) AS antal_varn,
            MAX(viewed_at) AS senaste_visning
        FROM admin_varn_views
        GROUP BY username
        ORDER BY totalt DESC
        """
    ).fetchall()


    admin_most_viewed = connection.execute(
        """
        SELECT
            username,
            varn_nr,
            COUNT(*) AS antal
        FROM admin_varn_views
        GROUP BY username, varn_nr
        ORDER BY username, antal DESC, varn_nr
        """
    ).fetchall()


    connection.close()


    # =================================
    # GEOJSON-STATISTIK
    # =================================

    with open(
        "data/BunkerLayer.geojson",
        "r",
        encoding="utf-8"
    ) as file:

        geojson_data = json.load(file)


    type_counts = {}
    status_counts = {}


    for feature in geojson_data.get("features", []):

        properties = feature.get(
            "properties",
            {}
        )

        typ = properties.get("Typ") or "Okänd"
        status = properties.get("Status") or "Okänd"

        typ = get_varn_type_name(typ)

        type_counts[typ] = (
            type_counts.get(typ, 0) + 1
        )

        status_counts[status] = (
            status_counts.get(status, 0) + 1
        )


    type_stats = sorted(
        type_counts.items(),
        key=lambda item: item[1],
        reverse=True
    )

    status_stats = sorted(
        status_counts.items(),
        key=lambda item: item[1],
        reverse=True
    )


    # =================================
    # GÖR DB-RADER TILL DICTS
    # =================================

    creators = [
        dict(row)
        for row in creators
    ]

    field_stats = [
        dict(row)
        for row in field_stats
    ]

    totals = dict(totals)

    database_stats = dict(database_stats)

    most_edited = [
        dict(row)
        for row in most_edited
    ]

    visitor_stats = dict(
        visitor_stats
    )

    most_viewed_public = [
        dict(row)
        for row in most_viewed_public
    ]


    daily_visitors = [
        dict(row)
        for row in daily_visitors
    ]

    admin_view_totals = [
        dict(row)
        for row in admin_view_totals
    ]

    admin_most_viewed = [
        dict(row)
        for row in admin_most_viewed
    ]

    return render_template(
        "admin_statistik.html",
        creators=creators,
        field_stats=field_stats,
        totals=totals,
        database_stats=database_stats,
        most_edited=most_edited,
        type_stats=type_stats,
        status_stats=status_stats,
        visitor_stats=visitor_stats,
        most_viewed_public=most_viewed_public,
        daily_visitors=daily_visitors,
        admin_view_totals=admin_view_totals,
        admin_most_viewed=admin_most_viewed
    )
# =================================
# SAKNAD INFORMATION
# =================================

@app.route("/admin/statistik/saknas/<field_name>")
@login_required
def admin_statistik_saknas(field_name):

    allowed_fields = {
        "historik": "Historik",
        "byggar": "Byggår",
        "parkering": "Parkering",
        "tillganglighet": "Tillgänglighet",
        "plomberad": "Plombering",
        "modell": "3D-modell"
    }

    if field_name not in allowed_fields:
        abort(404)

    connection = get_db_connection()

    missing_rows = connection.execute(
        f"""
        SELECT nr
        FROM varn
        WHERE NULLIF(TRIM({field_name}), '') IS NULL
        ORDER BY nr
        """
    ).fetchall()

    connection.close()

    missing_numbers = {
        str(row["nr"])
        for row in missing_rows
    }


    # =================================
    # KOMPLETTERA MED GEOJSON
    # =================================

    with open(
        "data/BunkerLayer.geojson",
        "r",
        encoding="utf-8"
    ) as file:
        geojson_data = json.load(file)


    missing_varn = []

    for feature in geojson_data.get("features", []):

        properties = feature.get(
            "properties",
            {}
        )

        nr = properties.get("Nr")

        if nr is None:
            continue

        nr = str(nr).strip()

        if nr not in missing_numbers:
            continue

        typ = properties.get("Typ") or "Okänd"
        status = properties.get("Status") or "Okänd"

        missing_varn.append({
            "nr": nr,
            "typ": get_varn_type_name(typ),
            "status": status
        })


    # Naturligare sortering av värnnummer
    def sort_key(item):

        nr = item["nr"]

        try:
            return (0, int(nr))
        except ValueError:
            return (1, nr)


    missing_varn.sort(
        key=sort_key
    )


    return render_template(
        "admin_statistik_saknas.html",
        field_name=field_name,
        field_label=allowed_fields[field_name],
        missing_varn=missing_varn
    )
# =================================
# ÄNDRINGSLOGG
# =================================

@app.route("/admin/logg")
@login_required
def admin_logg():

    connection = get_db_connection()

    changes = connection.execute(
        """
        SELECT
            id,
            varn_nr,
            username,
            field_name,
            old_value,
            new_value,
            changed_at
        FROM change_log
        ORDER BY changed_at DESC, id DESC
        LIMIT 500
        """
    ).fetchall()

    # ---------------------------------
    # Databasstatus
    # ---------------------------------

    database_stats = connection.execute(
        """
        SELECT
            COUNT(*) AS totalt,

            COUNT(*) FILTER (
                WHERE NULLIF(TRIM(historik), '') IS NOT NULL
            ) AS historik,

            COUNT(*) FILTER (
                WHERE NULLIF(TRIM(byggar), '') IS NOT NULL
            ) AS byggar,

            COUNT(*) FILTER (
                WHERE NULLIF(TRIM(parkering), '') IS NOT NULL
            ) AS parkering,

            COUNT(*) FILTER (
                WHERE NULLIF(TRIM(tillganglighet), '') IS NOT NULL
            ) AS tillganglighet,

            COUNT(*) FILTER (
                WHERE NULLIF(TRIM(plomberad), '') IS NOT NULL
            ) AS plomberad,

            COUNT(*) FILTER (
                WHERE NULLIF(TRIM(modell), '') IS NOT NULL
            ) AS modell

        FROM varn
        """
    ).fetchone()

    connection.close()

    changes = [
        dict(change)
        for change in changes
    ]

    return render_template(
        "admin_logg.html",
        changes=changes
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

        old_data = connection.execute(
            """
            SELECT *
            FROM varn
            WHERE nr = %s
            """,
            (str(nr),)
        ).fetchone()

        if old_data is not None:
            old_data = dict(old_data)
        else:
            old_data = {}

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
        # REGISTRERA ÄNDRINGAR
        # -----------------------------

        new_data = {
            "byggar": byggar,
            "historik": historik,
            "parkering": parkering,
            "tillganglighet": tillganglighet,
            "plomberad": plomberad,
            "modell": modell
        }

        field_labels = {
            "byggar": "Byggår",
            "historik": "Historik",
            "parkering": "Parkering",
            "tillganglighet": "Tillgänglighet",
            "plomberad": "Plomberad",
            "modell": "3D-modell"
        }

        for field_name, new_value in new_data.items():

            old_value = old_data.get(
                field_name,
                ""
            ) or ""

            new_value = new_value or ""

            if old_value != new_value:

                connection.execute(
                    """
                    INSERT INTO change_log (
                        varn_nr,
                        username,
                        field_name,
                        old_value,
                        new_value
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        str(nr),
                        session.get(
                            "username",
                            "okänd"
                        ),
                        field_labels.get(
                            field_name,
                            field_name
                        ),
                        old_value,
                        new_value
                    )
                )
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

VALUES (%s, %s, %s, %s, %s, %s, %s)

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
        WHERE nr = %s
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
