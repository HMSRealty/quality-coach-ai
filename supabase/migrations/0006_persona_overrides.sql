-- ============================================================================
-- Per-organization AI persona + Kill List overrides.
-- Owners/admins edit these from /dashboard/persona. The analyze route loads them
-- and falls back to the hardcoded defaults baked into the QA pipeline when null.
-- ============================================================================

alter table public.organizations
  add column if not exists qa_persona text,        -- markdown / plain text rules
  add column if not exists qa_killers jsonb;        -- array of { id, label, rule, enabled }

-- Pre-seed the default killer set so admins can edit, not start from blank.
update public.organizations set qa_killers = $$[
  {"id":"K1","enabled":true,"label":"Commercial / non-residential","rule":"Built retail/commercial/industrial spaces. EXCEPTION: vacant lots, raw land, Airbnbs, short-term rentals, multifamily and apartment complexes of any size are ACCEPTED."},
  {"id":"K2","enabled":true,"label":"Listed on MLS","rule":"Actively listed with a realtor, agent or broker. FSBO is accepted."},
  {"id":"K3","enabled":true,"label":"Under contract","rule":"In escrow, under contract, or accepting backup offers."},
  {"id":"K4","enabled":true,"label":"Timeline > 6 months","rule":"Seller explicitly will not sell for over 6 months, 'next year' or any vague far-future timeline."},
  {"id":"K5","enabled":true,"label":"Price-shopping","rule":"Seller is just testing the market with no actual intent to move."},
  {"id":"K6","enabled":true,"label":"Retail mindset / overpriced","rule":"Asking price is near or exceeds the Zillow Market Value."},
  {"id":"K7","enabled":true,"label":"Sarcastic bluffer","rule":"Mocking, not serious, or giving ridiculous numbers (e.g., 'one million dollars for a shack')."},
  {"id":"K8","enabled":true,"label":"Conditional blockers","rule":"Waiting on an event that hasn't started yet (e.g., waiting to file for divorce, waiting to find a new house but hasn't started looking)."},
  {"id":"K9","enabled":true,"label":"Not decision maker","rule":"Speaker is a tenant, neighbor, or otherwise has no authority to sell."},
  {"id":"K10","enabled":true,"label":"Aggressive refusal","rule":"Hostile owner who aggressively refuses to provide any information. Politely declining to give a price is NOT a kill."},
  {"id":"K11","enabled":true,"label":"DNC request","rule":"Seller requests to be taken off the list, says 'Do Not Call', or threatens legal/workplace action."},
  {"id":"K12","enabled":true,"label":"100% Spanish","rule":"The entire conversation is in Spanish."},
  {"id":"K13","enabled":true,"label":"Rejected selling 2+ times","rule":"Seller repeatedly says 'no' to selling throughout the call."},
  {"id":"K14","enabled":true,"label":"No price + no motivation","rule":"Seller refuses to give a number AND has absolutely no actionable reason or distress for selling."}
]$$::jsonb
where qa_killers is null;
