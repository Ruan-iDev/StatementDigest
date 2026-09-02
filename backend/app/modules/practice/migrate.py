"""Lightweight alters for Practice tables already created by create_all."""

from __future__ import annotations

from sqlalchemy import text


def _columns(conn, table: str) -> set[str]:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return {r[1] for r in rows}


def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:n"),
        {"n": table},
    ).fetchone()
    return row is not None


def migrate(engine) -> None:
    with engine.begin() as conn:
        if not _table_exists(conn, "practice_entries"):
            return
        cols = _columns(conn, "practice_entries")
        if "amount" not in cols:
            conn.execute(text("ALTER TABLE practice_entries ADD COLUMN amount NUMERIC(18, 2)"))
        if "document_id" not in cols:
            conn.execute(text("ALTER TABLE practice_entries ADD COLUMN document_id INTEGER"))
        if "expense_id" not in cols:
            conn.execute(text("ALTER TABLE practice_entries ADD COLUMN expense_id INTEGER"))
        if "wage_id" not in cols:
            conn.execute(text("ALTER TABLE practice_entries ADD COLUMN wage_id INTEGER"))
        if _table_exists(conn, "practice_wages"):
            wcols = _columns(conn, "practice_wages")
            if "days" not in wcols:
                conn.execute(text("ALTER TABLE practice_wages ADD COLUMN days NUMERIC(12, 2)"))
            if "rate_amount" not in wcols:
                conn.execute(
                    text("ALTER TABLE practice_wages ADD COLUMN rate_amount NUMERIC(18, 2)")
                )
            if "rate_period" not in wcols:
                conn.execute(text("ALTER TABLE practice_wages ADD COLUMN rate_period VARCHAR(20)"))
            if "deductions" not in wcols:
                conn.execute(text("ALTER TABLE practice_wages ADD COLUMN deductions JSON"))
            if "additions" not in wcols:
                conn.execute(text("ALTER TABLE practice_wages ADD COLUMN additions JSON"))
        if _table_exists(conn, "practice_staff"):
            scols = _columns(conn, "practice_staff")
            if "wage_amount" not in scols:
                conn.execute(text("ALTER TABLE practice_staff ADD COLUMN wage_amount NUMERIC(18, 2)"))
            if "wage_period" not in scols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_staff ADD COLUMN wage_period VARCHAR(20) NOT NULL DEFAULT 'week'"
                    )
                )
        if _table_exists(conn, "practice_staff") and _table_exists(conn, "practice_staff_wage_history"):
            conn.execute(
                text(
                    """
                    INSERT INTO practice_staff_wage_history
                        (user_profile_id, staff_id, amount, period, previous_amount, previous_period,
                         kind, effective_on, created_at)
                    SELECT s.user_profile_id, s.id, s.wage_amount, COALESCE(s.wage_period, 'week'),
                           NULL, NULL, 'start', date(s.created_at), CURRENT_TIMESTAMP
                    FROM practice_staff s
                    WHERE s.wage_amount IS NOT NULL
                      AND NOT EXISTS (
                          SELECT 1 FROM practice_staff_wage_history h WHERE h.staff_id = s.id
                      )
                    """
                )
            )
        if "occurred_on" not in cols:
            conn.execute(text("ALTER TABLE practice_entries ADD COLUMN occurred_on DATE"))
            conn.execute(
                text(
                    "UPDATE practice_entries SET occurred_on = date(created_at) "
                    "WHERE occurred_on IS NULL AND created_at IS NOT NULL"
                )
            )
        if "occurred_time" not in cols:
            conn.execute(text("ALTER TABLE practice_entries ADD COLUMN occurred_time VARCHAR(8)"))
        if _table_exists(conn, "practice_expenses"):
            ecols = _columns(conn, "practice_expenses")
            if "vendor_name" not in ecols:
                conn.execute(
                    text("ALTER TABLE practice_expenses ADD COLUMN vendor_name VARCHAR(240)")
                )
            if "supplier_id" not in ecols:
                conn.execute(text("ALTER TABLE practice_expenses ADD COLUMN supplier_id INTEGER"))
                conn.execute(
                    text(
                        """
                        UPDATE practice_expenses
                        SET supplier_id = (
                            SELECT p.id FROM practice_parties p
                            WHERE p.user_profile_id = practice_expenses.user_profile_id
                              AND p.kind = 'supplier'
                              AND lower(p.name) = lower(practice_expenses.vendor_name)
                            LIMIT 1
                        )
                        WHERE supplier_id IS NULL
                          AND vendor_name IS NOT NULL
                          AND trim(vendor_name) != ''
                        """
                    )
                )
        conn.execute(
            text(
                "UPDATE practice_entries SET occurred_on = NULL "
                "WHERE entry_type = 'status' AND title = 'Project opened'"
            )
        )

        if _table_exists(conn, "practice_parties"):
            pcols = _columns(conn, "practice_parties")
            if "party_type" not in pcols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_parties ADD COLUMN party_type VARCHAR(20) "
                        "NOT NULL DEFAULT 'individual'"
                    )
                )
            if "business_registration_number" not in pcols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_parties ADD COLUMN business_registration_number VARCHAR(80)"
                    )
                )

        if _table_exists(conn, "practice_documents"):
            dcols = _columns(conn, "practice_documents")
            if "issuer_snapshot" not in dcols:
                conn.execute(text("ALTER TABLE practice_documents ADD COLUMN issuer_snapshot JSON"))
            if "client_snapshot" not in dcols:
                conn.execute(text("ALTER TABLE practice_documents ADD COLUMN client_snapshot JSON"))
            if "bank_snapshot" not in dcols:
                conn.execute(text("ALTER TABLE practice_documents ADD COLUMN bank_snapshot JSON"))
            if "disclaimer_snapshot" not in dcols:
                conn.execute(text("ALTER TABLE practice_documents ADD COLUMN disclaimer_snapshot TEXT"))
            if "vat_enabled" not in dcols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_documents ADD COLUMN vat_enabled BOOLEAN NOT NULL DEFAULT 0"
                    )
                )
            if "vat_rate" not in dcols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_documents ADD COLUMN vat_rate NUMERIC(6, 3) NOT NULL DEFAULT 15"
                    )
                )
            if "subtotal" not in dcols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_documents ADD COLUMN subtotal NUMERIC(18, 2) NOT NULL DEFAULT 0"
                    )
                )
            if "vat_amount" not in dcols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_documents ADD COLUMN vat_amount NUMERIC(18, 2) NOT NULL DEFAULT 0"
                    )
                )
            if "notes_json" not in dcols:
                conn.execute(text("ALTER TABLE practice_documents ADD COLUMN notes_json JSON"))

        if _table_exists(conn, "practice_document_lines"):
            lcols = _columns(conn, "practice_document_lines")
            if "item" not in lcols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_document_lines ADD COLUMN item VARCHAR(200) NOT NULL DEFAULT ''"
                    )
                )

        if _table_exists(conn, "practice_templates"):
            tcols = _columns(conn, "practice_templates")
            if "number_prefix" not in tcols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_templates ADD COLUMN number_prefix VARCHAR(20) NOT NULL DEFAULT 'QTE'"
                    )
                )
                conn.execute(
                    text("UPDATE practice_templates SET number_prefix = 'INV' WHERE kind = 'invoice'")
                )
            if "number_width" not in tcols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_templates ADD COLUMN number_width INTEGER NOT NULL DEFAULT 3"
                    )
                )
            if "number_next" not in tcols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_templates ADD COLUMN number_next INTEGER NOT NULL DEFAULT 1"
                    )
                )

        if _table_exists(conn, "practice_settings"):
            scols = _columns(conn, "practice_settings")
            if "logo_path" not in scols:
                conn.execute(text("ALTER TABLE practice_settings ADD COLUMN logo_path VARCHAR(500)"))
            if "use_profile_issuer" not in scols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_settings ADD COLUMN use_profile_issuer BOOLEAN NOT NULL DEFAULT 0"
                    )
                )
            if "issuer_json" not in scols:
                conn.execute(text("ALTER TABLE practice_settings ADD COLUMN issuer_json JSON"))
            added_shared_vat = False
            if "vat_enabled" not in scols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_settings ADD COLUMN vat_enabled BOOLEAN NOT NULL DEFAULT 0"
                    )
                )
                added_shared_vat = True
            if "vat_rate" not in scols:
                conn.execute(
                    text(
                        "ALTER TABLE practice_settings ADD COLUMN vat_rate NUMERIC(6, 3) NOT NULL DEFAULT 15"
                    )
                )
                added_shared_vat = True
            # One-time lift from the old per-template VAT fields.
            if added_shared_vat and _table_exists(conn, "practice_templates"):
                conn.execute(
                    text(
                        """
                        UPDATE practice_settings
                        SET vat_enabled = COALESCE((
                            SELECT MAX(CASE WHEN t.vat_enabled THEN 1 ELSE 0 END)
                            FROM practice_templates t
                            WHERE t.user_profile_id = practice_settings.user_profile_id
                        ), 0),
                        vat_rate = COALESCE((
                            SELECT t.vat_rate FROM practice_templates t
                            WHERE t.user_profile_id = practice_settings.user_profile_id
                              AND t.vat_enabled = 1
                            ORDER BY CASE t.kind WHEN 'quote' THEN 0 ELSE 1 END
                            LIMIT 1
                        ), (
                            SELECT t.vat_rate FROM practice_templates t
                            WHERE t.user_profile_id = practice_settings.user_profile_id
                            ORDER BY CASE t.kind WHEN 'quote' THEN 0 ELSE 1 END
                            LIMIT 1
                        ), 15)
                        """
                    )
                )

        if _table_exists(conn, "practice_stock_items"):
            icols = _columns(conn, "practice_stock_items")
            if "category" not in icols:
                conn.execute(text("ALTER TABLE practice_stock_items ADD COLUMN category VARCHAR(80)"))
            if "markup_percent" not in icols:
                conn.execute(
                    text("ALTER TABLE practice_stock_items ADD COLUMN markup_percent NUMERIC(10, 2)")
                )
            if "markup_percent" in _columns(conn, "practice_stock_items"):
                conn.execute(
                    text(
                        """
                        UPDATE practice_stock_items
                        SET markup_percent = ROUND(
                            (retail_price - cost_price) * 100.0 / cost_price, 2
                        )
                        WHERE cost_price IS NOT NULL AND cost_price > 0
                          AND retail_price IS NOT NULL AND retail_price > 0
                          AND markup_percent IS NULL
                        """
                    )
                )
                conn.execute(
                    text(
                        """
                        UPDATE practice_stock_items
                        SET markup_percent = NULL
                        WHERE retail_price IS NULL OR retail_price = 0
                        """
                    )
                )

        if _table_exists(conn, "user_profiles") and _table_exists(conn, "ledgers"):
            profiles = conn.execute(text("SELECT id FROM user_profiles")).fetchall()
            for (pid,) in profiles:
                exists = conn.execute(
                    text(
                        "SELECT 1 FROM ledgers WHERE user_profile_id = :p AND name = :n"
                    ),
                    {"p": pid, "n": "Sales / Invoice Income"},
                ).fetchone()
                if not exists:
                    conn.execute(
                        text(
                            "INSERT INTO ledgers "
                            "(user_profile_id, name, type, is_system, is_archived, sort_order, created_at, updated_at) "
                            "VALUES (:p, :n, 'income', 1, 0, 45, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                        ),
                        {"p": pid, "n": "Sales / Invoice Income"},
                    )
