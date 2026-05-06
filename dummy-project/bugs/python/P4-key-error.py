# ── Bug P4: Python KeyError ──────────────────────────────────────────────────
# Accesses a missing dict key.
config = {
    "host": "localhost",
    "port": 3000
}

db_name = config["database"]  # KeyError
print(f"Connecting to {db_name}")
