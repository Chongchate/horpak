/**
 * Horpak data model.
 *
 * Conventions:
 * - Every table carries `org_id` so the app can become multi-tenant SaaS.
 *   ("org" = dorm business; "resident" = ผู้เช่า, to avoid confusing "tenant".)
 * - Money is stored in satang (bigint). 100 = 1 baht.
 * - Invoices snapshot everything they were computed from; issued invoices are
 *   never edited — void and reissue instead.
 * - Row Level Security: every table gets an org-membership policy, so data
 *   read through supabase-js (browser / LIFF) is scoped to the user's orgs.
 *   Server code connecting with the DB owner role bypasses RLS and must
 *   filter by org_id itself.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid, authUsers } from "drizzle-orm/supabase";

// ---------------------------------------------------------------------------
// helpers

const money = (name: string) => bigint(name, { mode: "number" });

const id = () => uuid("id").primaryKey().defaultRandom();

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

/** Rows are visible/writable only to members of the row's organization. */
const orgPolicy = (table: string) =>
  pgPolicy(`${table}_org_member`, {
    for: "all",
    to: authenticatedRole,
    using: sql`org_id in (select org_id from members where user_id = ${authUid})`,
    withCheck: sql`org_id in (select org_id from members where user_id = ${authUid})`,
  });

// ---------------------------------------------------------------------------
// enums

export const memberRole = pgEnum("member_role", ["owner", "admin", "staff"]);
export const roomStatus = pgEnum("room_status", ["vacant", "occupied", "reserved", "maintenance"]);
export const leaseStatus = pgEnum("lease_status", ["active", "ended", "terminated"]);
export const utilityType = pgEnum("utility_type", ["electric", "water"]);
export const readingKind = pgEnum("reading_kind", ["periodic", "move_in", "move_out", "install", "remove"]);
export const readingSource = pgEnum("reading_source", ["manual", "ai"]);
export const readingStatus = pgEnum("reading_status", ["draft", "confirmed"]);
export const rateMethod = pgEnum("rate_method", ["per_unit", "tiered", "flat"]);
export const prorationMode = pgEnum("proration_mode", ["none", "half_month", "daily"]);
export const lateFeeMode = pgEnum("late_fee_mode", ["off", "per_day", "fixed"]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "issued", "partially_paid", "paid", "void"]);
export const invoiceItemType = pgEnum("invoice_item_type", [
  "rent",
  "electric",
  "water",
  "charge",
  "late_fee",
  "fine",
  "discount",
  "adjustment",
]);
export const itemSource = pgEnum("item_source", ["auto", "manual"]);
export const paymentMethod = pgEnum("payment_method", ["promptpay", "transfer", "cash"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "approved", "rejected"]);

// ---------------------------------------------------------------------------
// organization & access

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    ...timestamps,
  },
  () => [
    pgPolicy("organizations_member", {
      for: "select",
      to: authenticatedRole,
      using: sql`id in (select org_id from members where user_id = ${authUid})`,
    }),
  ],
);

export const members = pgTable(
  "members",
  {
    orgId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("staff"),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    // A user sees only their own memberships; other policies build on this.
    pgPolicy("members_self", {
      for: "select",
      to: authenticatedRole,
      using: sql`user_id = ${authUid}`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// property & rooms

export const properties = pgTable(
  "properties",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    address: text("address"),
    promptpayId: text("promptpay_id"),
    billingDay: smallint("billing_day").notNull().default(25),
    dueDay: smallint("due_day").notNull().default(5),

    // ค่าเช่าเมื่อเข้า/ออกกลางเดือน
    prorationMode: prorationMode("proration_mode").notNull().default("half_month"),
    halfMonthCutoffDay: smallint("half_month_cutoff_day").notNull().default(15),

    // ค่าปรับจ่ายช้า (optional)
    lateFeeMode: lateFeeMode("late_fee_mode").notNull().default("off"),
    lateFeeAmount: money("late_fee_amount").notNull().default(0),
    lateFeeMax: money("late_fee_max"),
    lateFeeGraceDays: smallint("late_fee_grace_days").notNull().default(0),
    ...timestamps,
  },
  (t) => [index().on(t.orgId), orgPolicy("properties")],
);

export const rooms = pgTable(
  "rooms",
  {
    id: id(),
    orgId: orgId(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    floor: smallint("floor"),
    baseRent: money("base_rent").notNull(),
    status: roomStatus("status").notNull().default("vacant"),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.propertyId, t.number), index().on(t.orgId), orgPolicy("rooms")],
);

// ---------------------------------------------------------------------------
// residents & leases

export const residents = pgTable(
  "residents",
  {
    id: id(),
    orgId: orgId(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone"),
    idCardNo: text("id_card_no"), // encrypt at application layer (PDPA)
    idCardPath: text("id_card_path"), // private storage bucket
    lineUserId: text("line_user_id"),
    emergencyContact: jsonb("emergency_contact"),
    ...timestamps,
  },
  (t) => [
    index().on(t.orgId),
    uniqueIndex().on(t.orgId, t.lineUserId).where(sql`line_user_id is not null`),
    orgPolicy("residents"),
  ],
);

export const leases = pgTable(
  "leases",
  {
    id: id(),
    orgId: orgId(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"), // null = month-to-month
    rent: money("rent").notNull(),
    deposit: money("deposit").notNull().default(0),
    status: leaseStatus("status").notNull().default("active"),
    movedOutAt: date("moved_out_at"),
    ...timestamps,
  },
  (t) => [
    index().on(t.orgId),
    // at most one active lease per room
    uniqueIndex("leases_one_active_per_room").on(t.roomId).where(sql`status = 'active'`),
    orgPolicy("leases"),
  ],
);

export const leaseResidents = pgTable(
  "lease_residents",
  {
    orgId: orgId(),
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => leases.id, { onDelete: "cascade" }),
    residentId: uuid("resident_id")
      .notNull()
      .references(() => residents.id),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.leaseId, t.residentId] }), orgPolicy("lease_residents")],
);

// ---------------------------------------------------------------------------
// recurring charges (ค่าส่วนกลาง, เน็ต, ขยะ, ที่จอดรถ ...)

/** Property-level charge definition, e.g. ค่าส่วนกลาง 300 บาท. */
export const chargeTypes = pgTable(
  "charge_types",
  {
    id: id(),
    orgId: orgId(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    defaultAmount: money("default_amount").notNull(),
    applyByDefault: boolean("apply_by_default").notNull().default(true),
    prorate: boolean("prorate").notNull().default(false), // follow rent proration on move in/out
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index().on(t.orgId), orgPolicy("charge_types")],
);

/** Per-room override: turn a charge on/off or change its amount. */
export const roomCharges = pgTable(
  "room_charges",
  {
    orgId: orgId(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    chargeTypeId: uuid("charge_type_id")
      .notNull()
      .references(() => chargeTypes.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull(),
    amount: money("amount"), // null = charge type default
  },
  (t) => [primaryKey({ columns: [t.roomId, t.chargeTypeId] }), orgPolicy("room_charges")],
);

/** Charges tied to a specific lease (this resident's parking spot, etc.). */
export const leaseCharges = pgTable(
  "lease_charges",
  {
    id: id(),
    orgId: orgId(),
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => leases.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amount: money("amount").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
  },
  (t) => [index().on(t.leaseId), orgPolicy("lease_charges")],
);

// ---------------------------------------------------------------------------
// meters

export const meters = pgTable(
  "meters",
  {
    id: id(),
    orgId: orgId(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id),
    type: utilityType("type").notNull(),
    serialNo: text("serial_no"),
    multiplier: numeric("multiplier", { precision: 10, scale: 2, mode: "number" }).notNull().default(1),
    rolloverAt: numeric("rollover_at", { precision: 12, scale: 2, mode: "number" }), // value where the dial wraps to 0, e.g. 10000 for 4 digits
    installedAt: date("installed_at").notNull(),
    removedAt: date("removed_at"),
  },
  (t) => [
    index().on(t.roomId),
    uniqueIndex("meters_one_active_per_room_type").on(t.roomId, t.type).where(sql`removed_at is null`),
    orgPolicy("meters"),
  ],
);

export const meterReadings = pgTable(
  "meter_readings",
  {
    id: id(),
    orgId: orgId(),
    meterId: uuid("meter_id")
      .notNull()
      .references(() => meters.id),
    period: date("period").notNull(), // first day of billing month
    value: numeric("value", { precision: 12, scale: 2, mode: "number" }).notNull(),
    kind: readingKind("kind").notNull().default("periodic"),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    photoPath: text("photo_path"),
    source: readingSource("source").notNull().default("manual"),
    status: readingStatus("status").notNull().default("draft"),
    recordedBy: uuid("recorded_by"),
  },
  (t) => [
    index().on(t.meterId, t.readAt),
    uniqueIndex("meter_readings_one_periodic").on(t.meterId, t.period).where(sql`kind = 'periodic'`),
    orgPolicy("meter_readings"),
  ],
);

// ---------------------------------------------------------------------------
// utility rates

export const ratePlans = pgTable(
  "rate_plans",
  {
    id: id(),
    orgId: orgId(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    utility: utilityType("utility").notNull(),
    method: rateMethod("method").notNull(),
    unitPrice: money("unit_price"), // satang per unit
    minCharge: money("min_charge"),
    flatAmount: money("flat_amount"),
    effectiveFrom: date("effective_from").notNull(), // rate change = new row
    createdAt: timestamps.createdAt,
  },
  (t) => [index().on(t.propertyId, t.utility, t.effectiveFrom), orgPolicy("rate_plans")],
);

export const rateTiers = pgTable(
  "rate_tiers",
  {
    id: id(),
    orgId: orgId(),
    ratePlanId: uuid("rate_plan_id")
      .notNull()
      .references(() => ratePlans.id, { onDelete: "cascade" }),
    fromUnit: numeric("from_unit", { precision: 12, scale: 2, mode: "number" }).notNull(),
    toUnit: numeric("to_unit", { precision: 12, scale: 2, mode: "number" }), // null = no upper bound
    unitPrice: money("unit_price").notNull(),
  },
  (t) => [index().on(t.ratePlanId), orgPolicy("rate_tiers")],
);

// ---------------------------------------------------------------------------
// invoices & payments

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    orgId: orgId(),
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => leases.id),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id),
    period: date("period").notNull(),
    invoiceNo: text("invoice_no"), // assigned on issue
    status: invoiceStatus("status").notNull().default("draft"),
    issueDate: date("issue_date"),
    dueDate: date("due_date"),
    total: money("total").notNull().default(0),
    paidAmount: money("paid_amount").notNull().default(0),
    lateFeeBilled: boolean("late_fee_billed").notNull().default(false), // late fee already charged on a later invoice
    voidedReason: text("voided_reason"),
    replacedBy: uuid("replaced_by").references((): AnyPgColumn => invoices.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex().on(t.orgId, t.invoiceNo),
    uniqueIndex("invoices_one_per_lease_period").on(t.leaseId, t.period).where(sql`status <> 'void'`),
    index().on(t.orgId, t.period),
    orgPolicy("invoices"),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: id(),
    orgId: orgId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    /** Stable identity for regenerating drafts, e.g. "rent", "utility:electric", "charge:<id>". */
    itemKey: text("item_key").notNull(),
    type: invoiceItemType("type").notNull(),
    source: itemSource("source").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2, mode: "number" }),
    unitPrice: money("unit_price"),
    calculatedAmount: money("calculated_amount"), // what the system computed (null for manual items)
    amount: money("amount").notNull(), // what is actually billed
    overrideReason: text("override_reason"), // required when amount differs from calculated_amount
    excluded: boolean("excluded").notNull().default(false), // waived, e.g. late fee forgiven
    chargeTypeId: uuid("charge_type_id").references(() => chargeTypes.id),
    meta: jsonb("meta"), // meter readings, rate plan, proration details
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex().on(t.invoiceId, t.itemKey), orgPolicy("invoice_items")],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orgId: orgId(),
    residentId: uuid("resident_id").references(() => residents.id),
    amount: money("amount").notNull(),
    method: paymentMethod("method").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    slipPath: text("slip_path"),
    slipRef: text("slip_ref"), // bank transaction ref, prevents duplicate slips
    status: paymentStatus("status").notNull().default("pending"),
    verifiedBy: uuid("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index().on(t.orgId, t.paidAt),
    uniqueIndex().on(t.orgId, t.slipRef).where(sql`slip_ref is not null`),
    orgPolicy("payments"),
  ],
);

/** One payment may cover several invoices (e.g. paying two months at once). */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    orgId: orgId(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amount: money("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.paymentId, t.invoiceId] }), orgPolicy("payment_allocations")],
);

// ---------------------------------------------------------------------------
// support

/** Gapless invoice numbering per org + prefix (e.g. "INV-2610"). */
export const invoiceSequences = pgTable(
  "invoice_sequences",
  {
    orgId: orgId(),
    prefix: text("prefix").notNull(),
    lastNo: integer("last_no").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.prefix] }), orgPolicy("invoice_sequences")],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    orgId: orgId(),
    actorId: uuid("actor_id"),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    diff: jsonb("diff"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.orgId, t.entity, t.entityId), orgPolicy("audit_logs")],
);
