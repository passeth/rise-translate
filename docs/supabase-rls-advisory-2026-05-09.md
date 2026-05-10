# Supabase RLS advisory — 2026-05-09

Supabase reported a critical advisory: 70 existing non-`rt_` tables in the shared
project have Row Level Security disabled. This is outside the EVAS realtime
translation app migration, whose `rt_` tables all have RLS enabled.

Do **not** run this blindly in production: enabling RLS without compatible
policies can block existing applications. Review each table's access pattern and
add policies before or together with enabling RLS.

```sql
ALTER TABLE public.vp_formula ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vp_formula_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vp_creative_formula ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_inci_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_kit_bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_raw_mapping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_gift_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_raw_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_promo_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_order_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_products_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_sales_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_product_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_sales_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ru_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ru_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ru_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ru_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ru_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ru_packing_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ru_packing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ru_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_production_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_export_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_product_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_ingredient_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_test_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_products_old ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_product_bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_product_qc_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_product_english_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_product_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_product_work_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_product_subsidiary_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_manufacturing_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_manufacturing_process_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_ingredient_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_allergen_regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_fragrance_allergen_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_inci_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_research_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_labor_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_closing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_salary_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_production_io ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_inventory_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_ending_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_outsourcing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_calculation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_ref_subul ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosing_substances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosing_substance_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosing_function_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosing_regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosing_functions_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eu_label_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labdoc_msds_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_mapping_rule_backfill_report ENABLE ROW LEVEL SECURITY;
```
