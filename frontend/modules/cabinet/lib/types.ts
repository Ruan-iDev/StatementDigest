export type BundleNode = {
  key: string;
  name: string;
  collapsed?: boolean;
};

export type CabinetJobLine = {
  id: number;
  product_id: number | null;
  sort_order: number;
  quantity: string | number;
  name: string;
  family: string;
  group_name?: string | null;
  length_mm?: string | number | null;
  width_mm?: string | number | null;
  source_product_id?: number | null;
  detail?: string | null;
  bundle_path?: BundleNode[] | null;
  unit_price: string | number;
  vat_rate: string | number;
  line_ex_vat: string | number;
  vat_amount: string | number;
  line_total: string | number;
};

export type CabinetJob = {
  id: number;
  number: string;
  party_id: number;
  client_name: string;
  project_id?: number | null;
  job_reference?: string | null;
  vat_enabled: boolean;
  vat_rate: string | number;
  lines: CabinetJobLine[];
  ex_vat: string | number;
  vat: string | number;
  total: string | number;
  created_at: string;
  updated_at: string;
};

export type PricingRow = {
  product_id: number | null;
  name: string;
  family: string;
  detail: string;
  quantity: string | number;
  unit_label: string;
  unit_price: string | number;
  line_ex_vat: string | number;
  vat_amount: string | number;
  line_total: string | number;
};

export type PricingResult = {
  rows: PricingRow[];
  ex_vat: string | number;
  vat: string | number;
  total: string | number;
};

export type CabinetJobLineWrite = {
  product_id: number;
  quantity: number;
  length_mm?: number | null;
  width_mm?: number | null;
  source_product_id?: number | null;
  bundle_path?: BundleNode[] | null;
};
