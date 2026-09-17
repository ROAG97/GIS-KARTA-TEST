import json
import os

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from dotenv import load_dotenv


GEOJSON_PATH = "data/BunkerLayer.geojson"


# =================================
# LADDA MILJÖVARIABLER
# =================================

# Används lokalt på Fedora.
# På Render kommer DATABASE_URL från
# Render Environment Variables.
load_dotenv(".env.local")

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL saknas. "
        "Kontrollera .env.local eller "
        "Render Environment Variables."
    )


# =================================
# CONNECTION POOL
# =================================

pool = ConnectionPool(
    conninfo=DATABASE_URL,
    min_size=1,
    max_size=10,
    kwargs={
        "row_factory": dict_row
    }
)


# =================================
# DATABASANSLUTNING
# =================================

class PooledConnection:

    def __init__(self, pool):
        self.pool = pool
        self.connection = pool.getconn()


    def execute(self, *args, **kwargs):

        return self.connection.execute(
            *args,
            **kwargs
        )


    def executemany(self, *args, **kwargs):

        return self.connection.executemany(
            *args,
            **kwargs
        )


    def commit(self):

        return self.connection.commit()

    def rollback(self):

        return self.connection.rollback()


    def close(self):

        if self.connection is not None:

            self.pool.putconn(
                self.connection
            )

            self.connection = None


def get_db_connection():

    return PooledConnection(pool)

# =================================
# SKAPA DATABASTABELL
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

    # =================================
    # BESÖKSSTATISTIK
    # =================================

    connection.execute("""
        CREATE TABLE IF NOT EXISTS varn_views (
            id BIGSERIAL PRIMARY KEY,
            varn_nr TEXT NOT NULL,
            viewed_at TIMESTAMPTZ NOT NULL
                DEFAULT CURRENT_TIMESTAMP
        )
    """)

    connection.execute("""
        CREATE INDEX IF NOT EXISTS
        idx_varn_views_varn_nr
        ON varn_views (varn_nr)
    """)

    connection.execute("""
        CREATE INDEX IF NOT EXISTS
        idx_varn_views_viewed_at
        ON varn_views (viewed_at)
    """)

    # =================================
    # ADMIN-VISNINGAR
    # =================================

    connection.execute("""
        CREATE TABLE IF NOT EXISTS admin_varn_views (
            id BIGSERIAL PRIMARY KEY,
            varn_nr TEXT NOT NULL,
            username TEXT NOT NULL,
            viewed_at TIMESTAMPTZ NOT NULL
                DEFAULT CURRENT_TIMESTAMP
        )
    """)

    connection.execute("""
        CREATE INDEX IF NOT EXISTS
        idx_admin_varn_views_username
        ON admin_varn_views (username)
    """)

    connection.execute("""
        CREATE INDEX IF NOT EXISTS
        idx_admin_varn_views_varn_nr
        ON admin_varn_views (varn_nr)
    """)

    connection.execute("""
        CREATE INDEX IF NOT EXISTS
        idx_admin_varn_views_viewed_at
        ON admin_varn_views (viewed_at)
    """)
    connection.commit()
    connection.close()


# =================================
# SYNKA GEOJSON → NEON
#
# Skapar ENDAST värn som saknas.
# Befintlig admininformation skrivs
# aldrig över.
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


    # -----------------------------
    # Samla alla nummer från GeoJSON
    # -----------------------------

    geojson_nr = set()

    for feature in geojson_data.get(
        "features",
        []
    ):

        properties = feature.get(
            "properties",
            {}
        )

        nr = properties.get("Nr")

        if nr is None:
            continue

        nr = str(nr).strip()

        if nr:
            geojson_nr.add(nr)


    # -----------------------------
    # Hämta befintliga nummer
    # från Neon EN GÅNG
    # -----------------------------

    connection = get_db_connection()

    rows = connection.execute(
        """
        SELECT nr
        FROM varn
        """
    ).fetchall()

    existing_nr = {
        row["nr"]
        for row in rows
    }


    # -----------------------------
    # Jämför lokalt
    # -----------------------------

    nya_varn = sorted(
        geojson_nr - existing_nr
    )


    # -----------------------------
    # Lägg endast till nya värn
    # -----------------------------

    if nya_varn:

        connection.executemany(
            """
            INSERT INTO varn (nr)
            VALUES (%s)
            ON CONFLICT (nr)
            DO NOTHING
            """,
            [
                (nr,)
                for nr in nya_varn
            ]
        )

        connection.commit()


    connection.close()


    # -----------------------------
    # Resultat
    # -----------------------------

    if nya_varn:

        print(
            f"{len(nya_varn)} nya värn "
            f"lades till i Neon:"
        )

        for nr in nya_varn:
            print(f"  Värn {nr}")

    else:

        print(
            "Neon är redan synkad "
            "med GeoJSON."
        )


# =================================
# KÖR
# =================================

if __name__ == "__main__":

    create_database()

    sync_geojson_to_database()
