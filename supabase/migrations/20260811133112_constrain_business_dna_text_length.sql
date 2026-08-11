alter table public.business_dna
  add constraint business_dna_preferred_name_length check (preferred_name is null or char_length(preferred_name) <= 4000),
  add constraint business_dna_business_name_length check (business_name is null or char_length(business_name) <= 4000),
  add constraint business_dna_niche_length check (niche is null or char_length(niche) <= 4000),
  add constraint business_dna_markets_length check (markets is null or char_length(markets) <= 4000),
  add constraint business_dna_audiences_length check (audiences is null or char_length(audiences) <= 4000),
  add constraint business_dna_business_model_length check (business_model is null or char_length(business_model) <= 4000),
  add constraint business_dna_offers_length check (offers is null or char_length(offers) <= 4000),
  add constraint business_dna_price_ranges_length check (price_ranges is null or char_length(price_ranges) <= 4000),
  add constraint business_dna_positioning_length check (positioning is null or char_length(positioning) <= 4000),
  add constraint business_dna_methodology_length check (methodology is null or char_length(methodology) <= 4000),
  add constraint business_dna_delivery_length check (delivery is null or char_length(delivery) <= 4000),
  add constraint business_dna_team_context_length check (team_context is null or char_length(team_context) <= 4000);
