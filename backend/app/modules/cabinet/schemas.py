from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class JobLineIn(BaseModel):
    product_id: int
    quantity: Decimal = Decimal("1")
    length_mm: Optional[Decimal] = None
    width_mm: Optional[Decimal] = None
    source_product_id: Optional[int] = None
    bundle_path: Optional[list] = None


class JobLineOut(BaseModel):
    id: int
    product_id: Optional[int] = None
    sort_order: int
    quantity: Decimal
    name: str
    family: str
    group_name: Optional[str] = None
    length_mm: Optional[Decimal] = None
    width_mm: Optional[Decimal] = None
    source_product_id: Optional[int] = None
    detail: Optional[str] = None
    bundle_path: Optional[list] = None
    unit_price: Decimal
    vat_rate: Decimal
    line_ex_vat: Decimal
    vat_amount: Decimal
    line_total: Decimal


class LabourPreviewIn(BaseModel):
    lines: list[JobLineIn] = Field(default_factory=list)


class PricingLineIn(BaseModel):
    product_id: int
    quantity: Decimal = Decimal("1")
    length_mm: Optional[Decimal] = None
    width_mm: Optional[Decimal] = None
    source_product_id: Optional[int] = None
    detail: Optional[str] = None
    unit_price: Optional[Decimal] = None
    name: Optional[str] = None
    family: Optional[str] = None


class PricingIn(BaseModel):
    lines: list[PricingLineIn] = Field(default_factory=list)


class PricingRowOut(BaseModel):
    product_id: Optional[int] = None
    name: str
    family: str
    detail: str = ""
    quantity: Decimal
    unit_label: str
    unit_price: Decimal
    line_ex_vat: Decimal
    vat_amount: Decimal
    line_total: Decimal


class PricingOut(BaseModel):
    rows: list[PricingRowOut]
    ex_vat: Decimal
    vat: Decimal
    total: Decimal


class JobCreate(BaseModel):
    party_id: int


class JobUpdate(BaseModel):
    party_id: Optional[int] = None
    job_reference: Optional[str] = Field(default=None, max_length=120)
    project_id: Optional[int] = None
    lines: Optional[list[JobLineIn]] = None
    # When set, line order is the user's order, including cutting-labour slots.
    arrange: Optional[bool] = None


class JobAssign(BaseModel):
    project_id: int
    job_ids: list[int] = Field(min_length=1)


class JobOut(BaseModel):
    id: int
    number: str
    party_id: int
    client_name: str
    project_id: Optional[int] = None
    job_reference: Optional[str] = None
    vat_enabled: bool
    vat_rate: Decimal
    lines: list[JobLineOut]
    ex_vat: Decimal
    vat: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
