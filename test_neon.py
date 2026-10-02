import os

from dotenv import load_dotenv
import psycopg


# =================================
# LADDA NEON-INSTÄLLNINGAR
# =================================

load_dotenv(".env.local")

database_url = os.getenv("DATABASE_URL")


if not database_url:
    raise RuntimeError(
        "DATABASE_URL hittades inte i .env.local"
    )


# =================================
# TESTA ANSLUTNINGEN
# =================================

try:

    with psycopg.connect(database_url) as connection:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    current_database(),
                    current_user,
                    version()
                """
            )

            result = cursor.fetchone()


    print()
    print("=================================")
    print("NEON FUNGERAR!")
    print("=================================")
    print()
    print("Databas:", result[0])
    print("Användare:", result[1])
    print()
    print("PostgreSQL:")
    print(result[2])
    print()

except Exception as error:

    print()
    print("Kunde inte ansluta till Neon:")
    print(error)
