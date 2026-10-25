CREATE TYPE "public"."invoice_item_type" AS ENUM('rent', 'electric', 'water', 'charge', 'late_fee', 'fine', 'discount', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'partially_paid', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."item_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."late_fee_mode" AS ENUM('off', 'per_day', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."lease_status" AS ENUM('active', 'ended', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'staff');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('promptpay', 'transfer', 'cash');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."proration_mode" AS ENUM('none', 'half_month', 'daily');--> statement-breakpoint
CREATE TYPE "public"."rate_method" AS ENUM('per_unit', 'tiered', 'flat');--> statement-breakpoint
CREATE TYPE "public"."reading_kind" AS ENUM('periodic', 'move_in', 'move_out', 'install', 'remove');--> statement-breakpoint
CREATE TYPE "public"."reading_source" AS ENUM('manual', 'ai');--> statement-breakpoint
CREATE TYPE "public"."reading_status" AS ENUM('draft', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('vacant', 'occupied', 'reserved', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."utility_type" AS ENUM('electric', 'water');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_id" uuid,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"diff" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "charge_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"default_amount" bigint NOT NULL,
	"apply_by_default" boolean DEFAULT true NOT NULL,
	"prorate" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charge_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"type" "invoice_item_type" NOT NULL,
	"source" "item_source" NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 2),
	"unit_price" bigint,
	"calculated_amount" bigint,
	"amount" bigint NOT NULL,
	"override_reason" text,
	"excluded" boolean DEFAULT false NOT NULL,
	"charge_type_id" uuid,
	"meta" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_sequences" (
	"org_id" uuid NOT NULL,
	"prefix" text NOT NULL,
	"last_no" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_sequences_org_id_prefix_pk" PRIMARY KEY("org_id","prefix")
);
--> statement-breakpoint
ALTER TABLE "invoice_sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"period" date NOT NULL,
	"invoice_no" text,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"total" bigint DEFAULT 0 NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"late_fee_billed" boolean DEFAULT false NOT NULL,
	"voided_reason" text,
	"replaced_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lease_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" bigint NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date
);
--> statement-breakpoint
ALTER TABLE "lease_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lease_residents" (
	"org_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "lease_residents_lease_id_resident_id_pk" PRIMARY KEY("lease_id","resident_id")
);
--> statement-breakpoint
ALTER TABLE "lease_residents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"rent" bigint NOT NULL,
	"deposit" bigint DEFAULT 0 NOT NULL,
	"status" "lease_status" DEFAULT 'active' NOT NULL,
	"moved_out_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "members" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'staff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meter_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"meter_id" uuid NOT NULL,
	"period" date NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"kind" "reading_kind" DEFAULT 'periodic' NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"photo_path" text,
	"source" "reading_source" DEFAULT 'manual' NOT NULL,
	"status" "reading_status" DEFAULT 'draft' NOT NULL,
	"recorded_by" uuid
);
--> statement-breakpoint
ALTER TABLE "meter_readings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"type" "utility_type" NOT NULL,
	"serial_no" text,
	"multiplier" numeric(10, 2) DEFAULT 1 NOT NULL,
	"rollover_at" numeric(12, 2),
	"installed_at" date NOT NULL,
	"removed_at" date
);
--> statement-breakpoint
ALTER TABLE "meters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"org_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "payment_allocations_payment_id_invoice_id_pk" PRIMARY KEY("payment_id","invoice_id")
);
--> statement-breakpoint
ALTER TABLE "payment_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"resident_id" uuid,
	"amount" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"slip_path" text,
	"slip_ref" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"promptpay_id" text,
	"billing_day" smallint DEFAULT 25 NOT NULL,
	"due_day" smallint DEFAULT 5 NOT NULL,
	"proration_mode" "proration_mode" DEFAULT 'half_month' NOT NULL,
	"half_month_cutoff_day" smallint DEFAULT 15 NOT NULL,
	"late_fee_mode" "late_fee_mode" DEFAULT 'off' NOT NULL,
	"late_fee_amount" bigint DEFAULT 0 NOT NULL,
	"late_fee_max" bigint,
	"late_fee_grace_days" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rate_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"utility" "utility_type" NOT NULL,
	"method" "rate_method" NOT NULL,
	"unit_price" bigint,
	"min_charge" bigint,
	"flat_amount" bigint,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rate_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"from_unit" numeric(12, 2) NOT NULL,
	"to_unit" numeric(12, 2),
	"unit_price" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_tiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "residents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"id_card_no" text,
	"id_card_path" text,
	"line_user_id" text,
	"emergency_contact" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "residents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "room_charges" (
	"org_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"charge_type_id" uuid NOT NULL,
	"enabled" boolean NOT NULL,
	"amount" bigint,
	CONSTRAINT "room_charges_room_id_charge_type_id_pk" PRIMARY KEY("room_id","charge_type_id")
);
--> statement-breakpoint
ALTER TABLE "room_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"number" text NOT NULL,
	"floor" smallint,
	"base_rent" bigint NOT NULL,
	"status" "room_status" DEFAULT 'vacant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_types" ADD CONSTRAINT "charge_types_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_types" ADD CONSTRAINT "charge_types_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_charge_type_id_charge_types_id_fk" FOREIGN KEY ("charge_type_id") REFERENCES "public"."charge_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_replaced_by_invoices_id_fk" FOREIGN KEY ("replaced_by") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_charges" ADD CONSTRAINT "lease_charges_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_charges" ADD CONSTRAINT "lease_charges_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_residents" ADD CONSTRAINT "lease_residents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_residents" ADD CONSTRAINT "lease_residents_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_residents" ADD CONSTRAINT "lease_residents_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_tiers" ADD CONSTRAINT "rate_tiers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_tiers" ADD CONSTRAINT "rate_tiers_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_charges" ADD CONSTRAINT "room_charges_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_charges" ADD CONSTRAINT "room_charges_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_charges" ADD CONSTRAINT "room_charges_charge_type_id_charge_types_id_fk" FOREIGN KEY ("charge_type_id") REFERENCES "public"."charge_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_org_id_entity_entity_id_index" ON "audit_logs" USING btree ("org_id","entity","entity_id");--> statement-breakpoint
CREATE INDEX "charge_types_org_id_index" ON "charge_types" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_items_invoice_id_item_key_index" ON "invoice_items" USING btree ("invoice_id","item_key");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_id_invoice_no_index" ON "invoices" USING btree ("org_id","invoice_no");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_one_per_lease_period" ON "invoices" USING btree ("lease_id","period") WHERE status <> 'void';--> statement-breakpoint
CREATE INDEX "invoices_org_id_period_index" ON "invoices" USING btree ("org_id","period");--> statement-breakpoint
CREATE INDEX "lease_charges_lease_id_index" ON "lease_charges" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "leases_org_id_index" ON "leases" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leases_one_active_per_room" ON "leases" USING btree ("room_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "meter_readings_meter_id_read_at_index" ON "meter_readings" USING btree ("meter_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meter_readings_one_periodic" ON "meter_readings" USING btree ("meter_id","period") WHERE kind = 'periodic';--> statement-breakpoint
CREATE INDEX "meters_room_id_index" ON "meters" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meters_one_active_per_room_type" ON "meters" USING btree ("room_id","type") WHERE removed_at is null;--> statement-breakpoint
CREATE INDEX "payments_org_id_paid_at_index" ON "payments" USING btree ("org_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_org_id_slip_ref_index" ON "payments" USING btree ("org_id","slip_ref") WHERE slip_ref is not null;--> statement-breakpoint
CREATE INDEX "properties_org_id_index" ON "properties" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "rate_plans_property_id_utility_effective_from_index" ON "rate_plans" USING btree ("property_id","utility","effective_from");--> statement-breakpoint
CREATE INDEX "rate_tiers_rate_plan_id_index" ON "rate_tiers" USING btree ("rate_plan_id");--> statement-breakpoint
CREATE INDEX "residents_org_id_index" ON "residents" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "residents_org_id_line_user_id_index" ON "residents" USING btree ("org_id","line_user_id") WHERE line_user_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_property_id_number_index" ON "rooms" USING btree ("property_id","number");--> statement-breakpoint
CREATE INDEX "rooms_org_id_index" ON "rooms" USING btree ("org_id");--> statement-breakpoint
CREATE POLICY "audit_logs_org_member" ON "audit_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "charge_types_org_member" ON "charge_types" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "invoice_items_org_member" ON "invoice_items" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "invoice_sequences_org_member" ON "invoice_sequences" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "invoices_org_member" ON "invoices" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "lease_charges_org_member" ON "lease_charges" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "lease_residents_org_member" ON "lease_residents" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "leases_org_member" ON "leases" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "members_self" ON "members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "meter_readings_org_member" ON "meter_readings" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "meters_org_member" ON "meters" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "organizations_member" ON "organizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "payment_allocations_org_member" ON "payment_allocations" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "payments_org_member" ON "payments" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "properties_org_member" ON "properties" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "rate_plans_org_member" ON "rate_plans" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "rate_tiers_org_member" ON "rate_tiers" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "residents_org_member" ON "residents" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "room_charges_org_member" ON "room_charges" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "rooms_org_member" ON "rooms" AS PERMISSIVE FOR ALL TO "authenticated" USING (org_id in (select org_id from members where user_id = (select auth.uid()))) WITH CHECK (org_id in (select org_id from members where user_id = (select auth.uid())));