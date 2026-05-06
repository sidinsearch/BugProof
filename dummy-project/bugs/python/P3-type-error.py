# ── Bug P3: Python TypeError ─────────────────────────────────────────────────
# Calls a function with wrong argument types.
def add_numbers(a, b):
    return a + b

result = add_numbers("hello", 42)
print(result)
