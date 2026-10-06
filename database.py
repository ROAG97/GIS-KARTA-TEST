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
    },

    # Kontrollera att anslutningen fortfarande
    # lever innan den lämnas ut från poolen.
    check=ConnectionPool.check_connection,

    # Återvinn anslutningar regelbundet så att
    # gamla Neon-anslutningar inte ligger kvar.
    max_lifetime=900,

    # Vänta högst 10 sekunder på en connection.
    timeout=10
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

            try:
                if (
                    self.connection.info.transaction_status
                    != psycopg.pq.TransactionStatus.IDLE
                ):
                    self.connection.rollback()

            finally:
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
    # VÄRN - OMSLAGSBILD
    # =================================

    connection.execute("""
        ALTER TABLE varn
        ADD COLUMN IF NOT EXISTS image_url TEXT
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
    # =================================
    # DATABASPOSTER
    # =================================

    connection.execute("""
        CREATE TABLE IF NOT EXISTS database_posts (
            id BIGSERIAL PRIMARY KEY,
            slug TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT,
            image_url TEXT,
            intro TEXT,
            history TEXT,
            connection_text TEXT,
            published BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL
                DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL
                DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # =================================
    # DATABASPOSTER - FAKTA
    # =================================

    connection.execute("""
        CREATE TABLE IF NOT EXISTS database_post_facts (
            id BIGSERIAL PRIMARY KEY,

            post_id BIGINT NOT NULL
                REFERENCES database_posts(id)
                ON DELETE CASCADE,

            label TEXT NOT NULL,
            value TEXT NOT NULL,

            sort_order INTEGER NOT NULL
                DEFAULT 0
        )
    """)

    # =================================
    # DATABASPOSTER - BILDGALLERI
    # =================================

    connection.execute("""
        CREATE TABLE IF NOT EXISTS database_post_images (
            id BIGSERIAL PRIMARY KEY,

            post_id BIGINT NOT NULL
                REFERENCES database_posts(id)
                ON DELETE CASCADE,

            image_url TEXT NOT NULL,

            caption TEXT,

            sort_order INTEGER NOT NULL
                DEFAULT 0,

        created_at TIMESTAMPTZ NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        )
    """)

    connection.execute("""
        CREATE INDEX IF NOT EXISTS
        idx_database_post_facts_post_id
        ON database_post_facts (post_id)
    """)

    # =================================
    # VÄRN - BILDGALLERI
    # =================================

    connection.execute("""
        CREATE TABLE IF NOT EXISTS varn_images (
            id BIGSERIAL PRIMARY KEY,

            varn_nr TEXT NOT NULL
                REFERENCES varn(nr)
                ON DELETE CASCADE,

            image_url TEXT NOT NULL,

            caption TEXT,

            sort_order INTEGER NOT NULL
                DEFAULT 0,

            created_at TIMESTAMPTZ NOT NULL
                DEFAULT CURRENT_TIMESTAMP
        )
    """)

    connection.execute("""
        CREATE INDEX IF NOT EXISTS
        idx_varn_images_varn_nr
        ON varn_images (varn_nr)
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
