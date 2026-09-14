import sqlite3

from werkzeug.security import generate_password_hash


DATABASE = "data/varn.db"


def get_auth_connection():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def create_user_table():

    connection = get_auth_connection()

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'editor',
            active INTEGER NOT NULL DEFAULT 1
        )
        """
    )

    connection.commit()
    connection.close()


def create_user(
    username,
    password,
    role="editor"
):

    username = username.strip().lower()

    if role not in (
        "admin",
        "editor"
    ):
        raise ValueError(
            "Rollen måste vara admin eller editor."
        )

    password_hash = generate_password_hash(
        password
    )

    connection = get_auth_connection()

    try:

        connection.execute(
            """
            INSERT INTO users (
                username,
                password_hash,
                role
            )

            VALUES (?, ?, ?)
            """,
            (
                username,
                password_hash,
                role
            )
        )

        connection.commit()

    finally:
        connection.close()
