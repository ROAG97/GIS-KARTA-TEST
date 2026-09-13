import sqlite3
import json
import os


DB_PATH = "data/varn.db"
GEOJSON_PATH = "data/BunkerLayer.geojson"


# =================================
# DATABASANSLUTNING
# =================================

def get_db_connection():

    connection = sqlite3.connect(DB_PATH)

    connection.row_factory = sqlite3.Row

    return connection


# =================================
# SKAPA DATABAS
# =================================

def create_database():

    connection = get_db_connection()

    connection.execute("""
        CREATE TABLE IF NOT EXISTS varn (
            nr TEXT PRIMARY KEY,
            variant TEXT,
            byggar TEXT,
            historik TEXT,
            parkering TEXT,
            tillganglighet TEXT,
            plomberad TEXT,
            modell TEXT
        )
    """)

    connection.commit()

    connection.close()


# =================================
# SYNKA GEOJSON → SQLITE
# =================================

def sync_geojson_to_database():

    if not os.path.exists(GEOJSON_PATH):

        print(
            f"GeoJSON-filen hittades inte: "
            f"{GEOJSON_PATH}"
        )

        return


    # -----------------------------
    # Läs GeoJSON
    # -----------------------------

    with open(
        GEOJSON_PATH,
        "r",
        encoding="utf-8"
    ) as file:

        geojson_data = json.load(file)


    connection = get_db_connection()

    nya_varn = []


    # -----------------------------
    # Gå igenom alla värn
    # -----------------------------

    for feature in geojson_data.get(
        "features",
        []
    ):

        properties = feature.get(
            "properties",
            {}
        )

        nr = properties.get("Nr")


        # Hoppa över objekt utan nummer

        if nr is None:
            continue


        nr = str(nr).strip()


        if not nr:
            continue


        # -------------------------
        # Finns värnet redan?
        # -------------------------

        existing = connection.execute(
            """
            SELECT nr
            FROM varn
            WHERE nr = ?
            """,
            (nr,)
        ).fetchone()


        # -------------------------
        # Skapa endast om det saknas
        # -------------------------

        if existing is None:

            connection.execute(
                """
                INSERT INTO varn (
                    nr
                )
                VALUES (?)
                """,
                (nr,)
            )

            nya_varn.append(nr)


    connection.commit()

    connection.close()


    # -----------------------------
    # Resultat
    # -----------------------------

    if nya_varn:

        print(
            f"{len(nya_varn)} nya värn "
            f"lades till i SQLite:"
        )

        for nr in nya_varn:
            print(f"  Värn {nr}")

    else:

        print(
            "SQLite är redan synkad "
            "med GeoJSON."
        )


# =================================
# KÖR
# =================================

if __name__ == "__main__":

    create_database()

    sync_geojson_to_database()
