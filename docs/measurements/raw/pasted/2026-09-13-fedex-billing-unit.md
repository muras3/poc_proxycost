# FedEx: the clearance fee's billing unit

Date: 2026-09-13. Ingested by PR #111 (`ae86410`).

The owner's conclusion: the Disbursement Fee is charged **per Shipment (= per Air Waybill), not per box. GB and DE are the same.** Two boxes on one Air Waybill as a Multi-Piece Shipment incur one fee; separate Air Waybills incur two.

GB, from FedEx UK Conditions of Carriage, July 2025 (`https://www.fedex.com/en-gb/conditions-of-carriage/july-2025.html`):

> "Shipment" means one or more Packages or Freight, moving on a single Air Waybill.

GB, from FedEx UK Customs duties and taxes (`https://www.fedex.com/en-gb/billing/duty-tax.html`):

> If duty and tax charges are due when importing a shipment then FedEx may pay the duty and tax charges…

DE, from FedEx Germany Conditions of Carriage, January 2026 (`https://www.fedex.com/en-de/conditions-of-carriage/jan-2026.html`):

> "Shipment" means one or more Packages or Freight, moving on a single Air Waybill.

DE, from FedEx Germany Customs duties and taxes (`https://www.fedex.com/en-de/billing/duty-tax.html`):

> This incurs a Disbursement Fee, dependent on the duty and tax amount…

Both conditions of carriage also state:

> Multi-Piece Shipments. There is no limit on the aggregate weight of a multiple piece Shipment…

The owner's derived calculation unit: `disbursement_fee × FedEx Air Waybill数` — **not** the physical box count. With the caveat that if a proxy issues separate Air Waybills for two boxes, it is charged twice.

**Why this capture matters disproportionately:** FedEx's own site returns **HTTP 200 carrying a WAF page** to our fetches — recorded as `input_rejected` across four audit notes — so this is evidence **we could not obtain ourselves**. It is the only direct-fetch FedEx source in the project.
