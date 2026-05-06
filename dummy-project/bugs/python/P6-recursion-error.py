# ── Bug P6: Python RecursionError ────────────────────────────────────────────
# Infinite recursion triggers RecursionError.
import sys
sys.setrecursionlimit(200)

def factorial(n):
    return n * factorial(n - 1)

print(factorial(1000))
