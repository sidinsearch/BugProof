# ── Bug P5: Python ZeroDivisionError ─────────────────────────────────────────
# Classic divide by zero.
def calculate_average(total, count):
    return total / count

scores = []
avg = calculate_average(sum(scores), len(scores))
print(f"Average: {avg}")
