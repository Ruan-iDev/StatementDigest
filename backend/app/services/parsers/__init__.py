"""Statement parsers.

Bank isolation (each bank = own module; routing only in detect/base):
- discovery_pdf.py — LOCKED edition-1 Discovery Personal (226 txs human-verified 100%)
- fnb_pdf.py — LOCKED edition-1 FNB Gold Business (1000+ txs human-verified 100%)
- capitec_pdf.py — LOCKED edition-1 Capitec Business (bulk import TBD)
- nedbank_pdf.py — LOCKED edition-1 Nedbank Personal (bulk import TBD)
- Future Standard Bank / Absa → new modules only
- detect.py / parse_pdf_content only *route* to the right bank module

See docs/PARSER_STABILITY.md.
"""

from app.services.parsers.base import ParsedTransaction, parse_statement, preview_file
from app.services.parsers.detect import dissect_statement

__all__ = ["ParsedTransaction", "parse_statement", "preview_file", "dissect_statement"]
