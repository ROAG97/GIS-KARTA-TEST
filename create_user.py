from getpass import getpass

from auth import (
    create_user_table,
    create_user
)


create_user_table()


print()
print("Skapa användare")
print("----------------")


username = input(
    "Användarnamn: "
).strip()


password = getpass(
    "Lösenord: "
)


password_again = getpass(
    "Upprepa lösenord: "
)


if password != password_again:

    print(
        "Lösenorden matchar inte."
    )

    raise SystemExit


role = input(
    "Roll (admin/editor) [editor]: "
).strip().lower()


if not role:
    role = "editor"


try:

    create_user(
        username,
        password,
        role
    )

except Exception as error:

    print()
    print(
        f"Kunde inte skapa användaren: {error}"
    )

else:

    print()
    print(
        f"Användaren '{username}' skapades som {role}."
    )
