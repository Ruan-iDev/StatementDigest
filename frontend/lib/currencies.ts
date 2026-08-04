/**
 * ISO 4217-style currency catalogue for Settings.
 * code = abbreviation; name + country shown as grey helper text.
 */

export type CurrencyInfo = {
  code: string;
  name: string;
  /** Country or region (shown in brackets) */
  country: string;
};

/** Common picks first for SA / local finance apps, then full A–Z. */
const PRIORITY = ["ZAR", "USD", "EUR", "GBP", "AUD", "CAD", "CHF", "JPY", "CNY", "INR", "NZD", "BWP", "NAD", "MZN", "ZMW"];

export const CURRENCIES: CurrencyInfo[] = [
  { code: "AED", name: "UAE Dirham", country: "United Arab Emirates" },
  { code: "AFN", name: "Afghan Afghani", country: "Afghanistan" },
  { code: "ALL", name: "Albanian Lek", country: "Albania" },
  { code: "AMD", name: "Armenian Dram", country: "Armenia" },
  { code: "ANG", name: "Netherlands Antillean Guilder", country: "Curaçao & Sint Maarten" },
  { code: "AOA", name: "Angolan Kwanza", country: "Angola" },
  { code: "ARS", name: "Argentine Peso", country: "Argentina" },
  { code: "AUD", name: "Australian Dollar", country: "Australia" },
  { code: "AWG", name: "Aruban Florin", country: "Aruba" },
  { code: "AZN", name: "Azerbaijani Manat", country: "Azerbaijan" },
  { code: "BAM", name: "Bosnia-Herzegovina Convertible Mark", country: "Bosnia and Herzegovina" },
  { code: "BBD", name: "Barbadian Dollar", country: "Barbados" },
  { code: "BDT", name: "Bangladeshi Taka", country: "Bangladesh" },
  { code: "BGN", name: "Bulgarian Lev", country: "Bulgaria" },
  { code: "BHD", name: "Bahraini Dinar", country: "Bahrain" },
  { code: "BIF", name: "Burundian Franc", country: "Burundi" },
  { code: "BMD", name: "Bermudian Dollar", country: "Bermuda" },
  { code: "BND", name: "Brunei Dollar", country: "Brunei" },
  { code: "BOB", name: "Bolivian Boliviano", country: "Bolivia" },
  { code: "BRL", name: "Brazilian Real", country: "Brazil" },
  { code: "BSD", name: "Bahamian Dollar", country: "Bahamas" },
  { code: "BTN", name: "Bhutanese Ngultrum", country: "Bhutan" },
  { code: "BWP", name: "Botswana Pula", country: "Botswana" },
  { code: "BYN", name: "Belarusian Ruble", country: "Belarus" },
  { code: "BZD", name: "Belize Dollar", country: "Belize" },
  { code: "CAD", name: "Canadian Dollar", country: "Canada" },
  { code: "CDF", name: "Congolese Franc", country: "Democratic Republic of the Congo" },
  { code: "CHF", name: "Swiss Franc", country: "Switzerland" },
  { code: "CLP", name: "Chilean Peso", country: "Chile" },
  { code: "CNY", name: "Chinese Yuan Renminbi", country: "China" },
  { code: "COP", name: "Colombian Peso", country: "Colombia" },
  { code: "CRC", name: "Costa Rican Colón", country: "Costa Rica" },
  { code: "CUP", name: "Cuban Peso", country: "Cuba" },
  { code: "CVE", name: "Cape Verdean Escudo", country: "Cape Verde" },
  { code: "CZK", name: "Czech Koruna", country: "Czech Republic" },
  { code: "DJF", name: "Djiboutian Franc", country: "Djibouti" },
  { code: "DKK", name: "Danish Krone", country: "Denmark" },
  { code: "DOP", name: "Dominican Peso", country: "Dominican Republic" },
  { code: "DZD", name: "Algerian Dinar", country: "Algeria" },
  { code: "EGP", name: "Egyptian Pound", country: "Egypt" },
  { code: "ERN", name: "Eritrean Nakfa", country: "Eritrea" },
  { code: "ETB", name: "Ethiopian Birr", country: "Ethiopia" },
  { code: "EUR", name: "Euro", country: "Eurozone" },
  { code: "FJD", name: "Fijian Dollar", country: "Fiji" },
  { code: "FKP", name: "Falkland Islands Pound", country: "Falkland Islands" },
  { code: "GBP", name: "Pound Sterling", country: "United Kingdom" },
  { code: "GEL", name: "Georgian Lari", country: "Georgia" },
  { code: "GHS", name: "Ghanaian Cedi", country: "Ghana" },
  { code: "GIP", name: "Gibraltar Pound", country: "Gibraltar" },
  { code: "GMD", name: "Gambian Dalasi", country: "Gambia" },
  { code: "GNF", name: "Guinean Franc", country: "Guinea" },
  { code: "GTQ", name: "Guatemalan Quetzal", country: "Guatemala" },
  { code: "GYD", name: "Guyanese Dollar", country: "Guyana" },
  { code: "HKD", name: "Hong Kong Dollar", country: "Hong Kong" },
  { code: "HNL", name: "Honduran Lempira", country: "Honduras" },
  { code: "HRK", name: "Croatian Kuna", country: "Croatia" },
  { code: "HTG", name: "Haitian Gourde", country: "Haiti" },
  { code: "HUF", name: "Hungarian Forint", country: "Hungary" },
  { code: "IDR", name: "Indonesian Rupiah", country: "Indonesia" },
  { code: "ILS", name: "Israeli New Shekel", country: "Israel" },
  { code: "INR", name: "Indian Rupee", country: "India" },
  { code: "IQD", name: "Iraqi Dinar", country: "Iraq" },
  { code: "IRR", name: "Iranian Rial", country: "Iran" },
  { code: "ISK", name: "Icelandic Króna", country: "Iceland" },
  { code: "JMD", name: "Jamaican Dollar", country: "Jamaica" },
  { code: "JOD", name: "Jordanian Dinar", country: "Jordan" },
  { code: "JPY", name: "Japanese Yen", country: "Japan" },
  { code: "KES", name: "Kenyan Shilling", country: "Kenya" },
  { code: "KGS", name: "Kyrgyzstani Som", country: "Kyrgyzstan" },
  { code: "KHR", name: "Cambodian Riel", country: "Cambodia" },
  { code: "KMF", name: "Comorian Franc", country: "Comoros" },
  { code: "KPW", name: "North Korean Won", country: "North Korea" },
  { code: "KRW", name: "South Korean Won", country: "South Korea" },
  { code: "KWD", name: "Kuwaiti Dinar", country: "Kuwait" },
  { code: "KYD", name: "Cayman Islands Dollar", country: "Cayman Islands" },
  { code: "KZT", name: "Kazakhstani Tenge", country: "Kazakhstan" },
  { code: "LAK", name: "Lao Kip", country: "Laos" },
  { code: "LBP", name: "Lebanese Pound", country: "Lebanon" },
  { code: "LKR", name: "Sri Lankan Rupee", country: "Sri Lanka" },
  { code: "LRD", name: "Liberian Dollar", country: "Liberia" },
  { code: "LSL", name: "Lesotho Loti", country: "Lesotho" },
  { code: "LYD", name: "Libyan Dinar", country: "Libya" },
  { code: "MAD", name: "Moroccan Dirham", country: "Morocco" },
  { code: "MDL", name: "Moldovan Leu", country: "Moldova" },
  { code: "MGA", name: "Malagasy Ariary", country: "Madagascar" },
  { code: "MKD", name: "Macedonian Denar", country: "North Macedonia" },
  { code: "MMK", name: "Myanmar Kyat", country: "Myanmar" },
  { code: "MNT", name: "Mongolian Tögrög", country: "Mongolia" },
  { code: "MOP", name: "Macanese Pataca", country: "Macau" },
  { code: "MRU", name: "Mauritanian Ouguiya", country: "Mauritania" },
  { code: "MUR", name: "Mauritian Rupee", country: "Mauritius" },
  { code: "MVR", name: "Maldivian Rufiyaa", country: "Maldives" },
  { code: "MWK", name: "Malawian Kwacha", country: "Malawi" },
  { code: "MXN", name: "Mexican Peso", country: "Mexico" },
  { code: "MYR", name: "Malaysian Ringgit", country: "Malaysia" },
  { code: "MZN", name: "Mozambican Metical", country: "Mozambique" },
  { code: "NAD", name: "Namibian Dollar", country: "Namibia" },
  { code: "NGN", name: "Nigerian Naira", country: "Nigeria" },
  { code: "NIO", name: "Nicaraguan Córdoba", country: "Nicaragua" },
  { code: "NOK", name: "Norwegian Krone", country: "Norway" },
  { code: "NPR", name: "Nepalese Rupee", country: "Nepal" },
  { code: "NZD", name: "New Zealand Dollar", country: "New Zealand" },
  { code: "OMR", name: "Omani Rial", country: "Oman" },
  { code: "PAB", name: "Panamanian Balboa", country: "Panama" },
  { code: "PEN", name: "Peruvian Sol", country: "Peru" },
  { code: "PGK", name: "Papua New Guinean Kina", country: "Papua New Guinea" },
  { code: "PHP", name: "Philippine Peso", country: "Philippines" },
  { code: "PKR", name: "Pakistani Rupee", country: "Pakistan" },
  { code: "PLN", name: "Polish Złoty", country: "Poland" },
  { code: "PYG", name: "Paraguayan Guaraní", country: "Paraguay" },
  { code: "QAR", name: "Qatari Riyal", country: "Qatar" },
  { code: "RON", name: "Romanian Leu", country: "Romania" },
  { code: "RSD", name: "Serbian Dinar", country: "Serbia" },
  { code: "RUB", name: "Russian Ruble", country: "Russia" },
  { code: "RWF", name: "Rwandan Franc", country: "Rwanda" },
  { code: "SAR", name: "Saudi Riyal", country: "Saudi Arabia" },
  { code: "SBD", name: "Solomon Islands Dollar", country: "Solomon Islands" },
  { code: "SCR", name: "Seychellois Rupee", country: "Seychelles" },
  { code: "SDG", name: "Sudanese Pound", country: "Sudan" },
  { code: "SEK", name: "Swedish Krona", country: "Sweden" },
  { code: "SGD", name: "Singapore Dollar", country: "Singapore" },
  { code: "SHP", name: "Saint Helena Pound", country: "Saint Helena" },
  { code: "SLE", name: "Sierra Leonean Leone", country: "Sierra Leone" },
  { code: "SOS", name: "Somali Shilling", country: "Somalia" },
  { code: "SRD", name: "Surinamese Dollar", country: "Suriname" },
  { code: "SSP", name: "South Sudanese Pound", country: "South Sudan" },
  { code: "STN", name: "São Tomé and Príncipe Dobra", country: "São Tomé and Príncipe" },
  { code: "SYP", name: "Syrian Pound", country: "Syria" },
  { code: "SZL", name: "Swazi Lilangeni", country: "Eswatini" },
  { code: "THB", name: "Thai Baht", country: "Thailand" },
  { code: "TJS", name: "Tajikistani Somoni", country: "Tajikistan" },
  { code: "TMT", name: "Turkmenistani Manat", country: "Turkmenistan" },
  { code: "TND", name: "Tunisian Dinar", country: "Tunisia" },
  { code: "TOP", name: "Tongan Paʻanga", country: "Tonga" },
  { code: "TRY", name: "Turkish Lira", country: "Turkey" },
  { code: "TTD", name: "Trinidad and Tobago Dollar", country: "Trinidad and Tobago" },
  { code: "TWD", name: "New Taiwan Dollar", country: "Taiwan" },
  { code: "TZS", name: "Tanzanian Shilling", country: "Tanzania" },
  { code: "UAH", name: "Ukrainian Hryvnia", country: "Ukraine" },
  { code: "UGX", name: "Ugandan Shilling", country: "Uganda" },
  { code: "USD", name: "United States Dollar", country: "United States" },
  { code: "UYU", name: "Uruguayan Peso", country: "Uruguay" },
  { code: "UZS", name: "Uzbekistani Som", country: "Uzbekistan" },
  { code: "VES", name: "Venezuelan Bolívar Soberano", country: "Venezuela" },
  { code: "VND", name: "Vietnamese Đồng", country: "Vietnam" },
  { code: "VUV", name: "Vanuatu Vatu", country: "Vanuatu" },
  { code: "WST", name: "Samoan Tala", country: "Samoa" },
  { code: "XAF", name: "Central African CFA Franc", country: "CEMAC (Central Africa)" },
  { code: "XCD", name: "East Caribbean Dollar", country: "OECS (Eastern Caribbean)" },
  { code: "XOF", name: "West African CFA Franc", country: "UEMOA (West Africa)" },
  { code: "XPF", name: "CFP Franc", country: "French Pacific territories" },
  { code: "YER", name: "Yemeni Rial", country: "Yemen" },
  { code: "ZAR", name: "South African Rand", country: "South Africa" },
  { code: "ZMW", name: "Zambian Kwacha", country: "Zambia" },
  { code: "ZWG", name: "Zimbabwe Gold", country: "Zimbabwe" },
];

export function currencyHelper(c: CurrencyInfo): string {
  return `${c.name} (${c.country})`;
}

export function findCurrency(code: string | null | undefined): CurrencyInfo | undefined {
  if (!code) return undefined;
  const up = code.trim().toUpperCase();
  return CURRENCIES.find((c) => c.code === up);
}

/** Common symbols; ZAR → R (SA accounting style), not "ZAR". */
const SYMBOL_OVERRIDES: Record<string, string> = {
  ZAR: "R",
  NAD: "N$",
  BWP: "P",
  USD: "$",
  CAD: "C$",
  AUD: "A$",
  NZD: "NZ$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  INR: "₹",
  CHF: "CHF",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  BRL: "R$",
  MXN: "MX$",
  SGD: "S$",
  HKD: "HK$",
  KRW: "₩",
  TRY: "₺",
  PLN: "zł",
  THB: "฿",
  ILS: "₪",
  AED: "د.إ",
  NGN: "₦",
  KES: "KSh",
  GHS: "GH₵",
  EGP: "E£",
  ZMW: "ZK",
  MZN: "MT",
};

/**
 * Display symbol for a currency code (e.g. ZAR → R, USD → $).
 * Falls back to Intl narrow symbol, then the code itself.
 */
export function currencySymbol(code: string | null | undefined): string {
  if (!code) return "";
  const up = code.trim().toUpperCase();
  if (SYMBOL_OVERRIDES[up]) return SYMBOL_OVERRIDES[up];
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: up,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency")?.value;
    if (sym && sym !== up) return sym;
  } catch {
    /* ignore invalid codes */
  }
  return up;
}

/** Priority currencies first, then alphabetical by code. */
export function sortedCurrencies(): CurrencyInfo[] {
  const byCode = new Map(CURRENCIES.map((c) => [c.code, c]));
  const seen = new Set<string>();
  const out: CurrencyInfo[] = [];
  for (const code of PRIORITY) {
    const c = byCode.get(code);
    if (c) {
      out.push(c);
      seen.add(code);
    }
  }
  const rest = CURRENCIES.filter((c) => !seen.has(c.code)).sort((a, b) =>
    a.code.localeCompare(b.code)
  );
  return [...out, ...rest];
}
