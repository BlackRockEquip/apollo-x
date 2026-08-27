# Phase 2 reference mapping

This mapping preserves later import capability; neither source field is silently discarded.

| New Apollo X concept | Old Apollo source | Mornay source | Decision |
|---|---|---|---|
| Customer | `customers.customer_name`, single contact/address fields | `Client`, aliases, account number and structured branch data | Mornay-style structured account with old Apollo workshop-history links reserved for later jobs |
| Customer branch/contact/address | Mostly flattened customer fields | `ClientBranch` and richer client forms | Separate tenant-keyed children; multiple typed addresses and branch-linked contacts |
| Supplier | Simple `suppliers` table and operational supplier workflow | Structured supplier, contacts and string brand list | Structured supplier with canonical many-to-many Manufacturer relationship |
| Part | `parts` plus separate `inventory(part_id, location_id, quantity)` | Inventory/part lines coupled to workflows | Preserve the old system's definition-versus-balance separation; no Phase 2 quantity column |
| Manufacturer/brand | Free-text `parts.manufacturer` | Supplier brand strings and component make | Canonical tenant master; import normalization can retain source spellings |
| Storage location | `storage_locations` and location-specific inventory balances | Bin/location text in inventory workflows | Old operational types plus parent hierarchy; Phase 3 ledger/balances will reference IDs |
| Labour/service | Workshop charges embedded in workflows | Job/outwork charge concepts | First-class Decimal-priced catalogue for future commercial snapshots |
| Tax | VAT fields and assumptions | Company details/document settings | Effective-dated central tax codes; future documents snapshot applied code/rate |
| Commercial terms | Scattered strings/defaults | Company/client settings | Typed reusable terms with customer/supplier/company defaults |
| Numbering | Module-specific/manual numbering | Job/order number fields | One company/type sequence table; atomic allocation; invoice allocation deferred until issue |
| Company settings | Operational settings service | Rich company identity, theme and document branding | Protected `internalCode`; legal/commercial/document settings expanded separately |

Import work must retain source identifiers and raw values in staging, report collisions, normalize codes case-insensitively, and require explicit resolution for ambiguous customer, supplier, manufacturer, tax, and location matches.
