"""Quick end-to-end smoke test against a running API."""

import httpx
from pathlib import Path

base = "http://127.0.0.1:8470/api"
client = httpx.Client(timeout=30.0)

print("health", client.get(f"{base}/health").json())

ledgers = client.get(f"{base}/ledgers").json()
print("ledgers", len(ledgers))

profiles = client.get(f"{base}/bank-profiles").json()
if profiles:
    pid = profiles[0]["id"]
else:
    preset = client.get(f"{base}/bank-profiles/presets/FNB").json()
    pid = client.post(
        f"{base}/bank-profiles",
        json={"name": "FNB Sample", "bank_type": "FNB", "calibration_data": preset},
    ).json()["id"]
print("profile", pid)

csv_path = Path(__file__).resolve().parent.parent / "samples" / "fnb_sample.csv"
with csv_path.open("rb") as f:
    r = client.post(
        f"{base}/imports/upload",
        data={"bank_profile_id": str(pid)},
        files={"file": (csv_path.name, f, "text/csv")},
    )
print("import status", r.status_code, r.text[:500])
r.raise_for_status()
imp = r.json()
print("imported", imp["transactions_created"], "rules_applied", imp["rules_applied"])

pending = client.get(f"{base}/transactions", params={"pending_only": True}).json()
print("pending", len(pending))

sub = next(l for l in ledgers if "Subscription" in l["name"])
salary = next(l for l in ledgers if "Salary" in l["name"])
bank = next(l for l in ledgers if "Bank Charges" in l["name"])

rr = client.post(
    f"{base}/rules",
    json={
        "name": "Netflix",
        "match_type": "contains",
        "match_value": "NETFLIX",
        "ledger_id": sub["id"],
        "priority": 50,
        "is_active": True,
    },
).json()
print("rule", rr)

pending2 = client.get(f"{base}/transactions", params={"pending_only": True}).json()
print("pending after netflix rule", len(pending2))

sal_txs = [t["id"] for t in pending2 if "SALARY" in t["description"].upper()]
if sal_txs:
    print(
        "bulk salary",
        client.post(
            f"{base}/transactions/bulk-categorise",
            json={"transaction_ids": sal_txs, "ledger_id": salary["id"]},
        ).json(),
    )

print(
    "fee rule",
    client.post(
        f"{base}/rules",
        json={
            "name": "FNB fees",
            "match_type": "contains",
            "match_value": "FNB FEE",
            "ledger_id": bank["id"],
            "priority": 40,
            "is_active": True,
        },
    ).json(),
)

pending3 = client.get(f"{base}/transactions", params={"pending_only": True}).json()
print("pending final", len(pending3))

pl = client.get(f"{base}/reports/pl", params={"period": "financial_year"}).json()
print(
    "PL income",
    [(x["ledger_name"], x["amount"]) for x in pl["income_lines"]],
    "expense",
    [(x["ledger_name"], x["amount"]) for x in pl["expense_lines"]],
    "net",
    pl["net_result"],
)

pdf = client.get(f"{base}/reports/pl/pdf", params={"period": "financial_year"})
print("pdf", pdf.status_code, pdf.headers.get("content-type"), len(pdf.content))
assert pdf.status_code == 200
assert len(pdf.content) > 500

print("dashboard pending", client.get(f"{base}/dashboard").json()["pending_count"])
print("SMOKE OK")
