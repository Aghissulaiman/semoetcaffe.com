-- Semoet Cafe application schema
-- PostgreSQL 15+ | Fresh-install baseline; manage future changes with versioned migrations.
-- Store product/customer image bytes in object storage (S3-compatible, etc.); persist keys and metadata here.
-- Monetary values are integer IDR rupiah to avoid floating-point rounding.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE SCHEMA IF NOT EXISTS semoet;
SET search_path TO semoet, public;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Identity, access control, customer and family accounts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  action text NOT NULL,
  UNIQUE (resource, action)
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text UNIQUE,
  email citext UNIQUE,
  display_name text NOT NULL,
  password_hash text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended','deleted')),
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (phone_e164 IS NOT NULL OR email IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);
CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google','apple')),
  provider_subject text NOT NULL,
  provider_email citext,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, provider)
);
CREATE TABLE IF NOT EXISTS otp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('login','signup','verify_phone','password_reset')),
  code_hash text NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  request_ip inet,
  CHECK (expires_at > requested_at)
);
CREATE INDEX IF NOT EXISTS otp_requests_phone_latest_idx ON otp_requests(phone_e164, requested_at DESC);
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL UNIQUE,
  device_label text,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS user_sessions_user_active_idx ON user_sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS customer_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  minimum_lifetime_points integer NOT NULL DEFAULT 0 CHECK (minimum_lifetime_points >= 0),
  benefits jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier_id uuid REFERENCES customer_tiers(id) ON DELETE SET NULL,
  birth_date date,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,
  recipient_name text NOT NULL,
  recipient_phone text NOT NULL,
  address_line text NOT NULL,
  address_detail text,
  city text NOT NULL,
  province text,
  postal_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  delivery_instructions text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_one_default_idx ON user_addresses(user_id) WHERE is_default;
CREATE TABLE IF NOT EXISTS family_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Semoet Family',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id)
);
CREATE TABLE IF NOT EXISTS family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_group_id uuid NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  linked_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  relationship text,
  birth_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (display_name <> '')
);
CREATE INDEX IF NOT EXISTS family_members_group_idx ON family_members(family_group_id);

-- -----------------------------------------------------------------------------
-- Cafe locations, service hours and menu catalog
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text,
  email text,
  address text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  latitude numeric(10,7),
  longitude numeric(10,7),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS branch_business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  service_type text NOT NULL DEFAULT 'all' CHECK (service_type IN ('all','dine_in','pickup','delivery')),
  UNIQUE (branch_id, day_of_week, service_type, opens_at)
);
CREATE TABLE IF NOT EXISTS dining_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  area_type text NOT NULL CHECK (area_type IN ('indoor','outdoor','private_room','other')),
  -- Ruangan disewakan per jam; harga ini jadi dasar perhitungan DP & pelunasan.
  price_per_hour_idr bigint CHECK (price_per_hour_idr IS NULL OR price_per_hour_idr >= 0),
  image_url text,
  image_storage_key text,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (branch_id, name)
);
CREATE TABLE IF NOT EXISTS cafe_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES dining_areas(id) ON DELETE RESTRICT,
  table_code text NOT NULL,
  capacity smallint NOT NULL CHECK (capacity > 0),
  qr_token_hash text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (area_id, table_code)
);

-- Migrasi idempoten: kolom gambar area (diisi admin lewat panel, dipakai app
-- pelanggan untuk menampilkan pilihan area bergambar).
ALTER TABLE dining_areas ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE dining_areas ADD COLUMN IF NOT EXISTS image_storage_key text;
-- Harga sewa ruangan per jam (dasar perhitungan DP & pelunasan).
ALTER TABLE dining_areas ADD COLUMN IF NOT EXISTS price_per_hour_idr bigint;
-- Salinan di schema `public` (runtime app memakai search_path default → public).
ALTER TABLE public.dining_areas ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.dining_areas ADD COLUMN IF NOT EXISTS image_storage_key text;
ALTER TABLE public.dining_areas ADD COLUMN IF NOT EXISTS price_per_hour_idr bigint;

CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preparation_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO preparation_stations (code, name, sort_order, is_active) VALUES
  ('kitchen', 'Koki (Dapur)', 1, true),
  ('bar', 'Bar', 2, true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES product_categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  product_kind text NOT NULL DEFAULT 'standard' CHECK (product_kind IN ('food','drink','coffee','snack','dessert','bundle','buffet','event','other','standard')),
  preparation_station text NOT NULL DEFAULT 'kitchen',
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  available_from timestamptz,
  available_until timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  CHECK (available_until IS NULL OR available_from IS NULL OR available_until > available_from)
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS preparation_station text NOT NULL DEFAULT 'kitchen';
CREATE INDEX IF NOT EXISTS products_deleted_at_idx ON products(deleted_at) WHERE deleted_at IS NOT NULL;

-- Salinan di schema `public` (runtime app memakai search_path default → public).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS preparation_station text NOT NULL DEFAULT 'kitchen';
CREATE INDEX IF NOT EXISTS products_deleted_at_public_idx ON public.products(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  public_url text,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  width_px integer CHECK (width_px IS NULL OR width_px > 0),
  height_px integer CHECK (height_px IS NULL OR height_px > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_images_one_primary_idx ON product_images(product_id) WHERE is_primary;
CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text UNIQUE,
  name text NOT NULL DEFAULT 'Regular',
  price_idr bigint NOT NULL CHECK (price_idr >= 0),
  cost_idr bigint NOT NULL DEFAULT 0 CHECK (cost_idr >= 0),
  compare_at_price_idr bigint CHECK (compare_at_price_idr IS NULL OR compare_at_price_idr >= price_idr),
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_one_default_idx ON product_variants(product_id) WHERE is_default;
CREATE TABLE IF NOT EXISTS product_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  day_of_week smallint CHECK (day_of_week BETWEEN 0 AND 6),
  starts_at time,
  ends_at time,
  starts_on timestamptz,
  ends_on timestamptz,
  is_available boolean NOT NULL DEFAULT true,
  CHECK ((starts_at IS NULL) = (ends_at IS NULL)),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on > starts_on)
);
CREATE INDEX IF NOT EXISTS product_availability_lookup_idx ON product_availability(product_id, branch_id, day_of_week);

CREATE TABLE IF NOT EXISTS modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  min_select smallint NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select smallint NOT NULL DEFAULT 1 CHECK (max_select >= min_select),
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS modifier_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta_idr bigint NOT NULL DEFAULT 0 CHECK (price_delta_idr >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (group_id, name)
);
CREATE TABLE IF NOT EXISTS product_modifier_groups (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  min_select_override smallint CHECK (min_select_override IS NULL OR min_select_override >= 0),
  max_select_override smallint CHECK (max_select_override IS NULL OR max_select_override >= 0),
  PRIMARY KEY (product_id, group_id)
);

CREATE TABLE IF NOT EXISTS home_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  image_storage_key text NOT NULL,
  image_url text,
  target_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE TABLE IF NOT EXISTS featured_products (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  placement text NOT NULL CHECK (placement IN ('favorite','new','family_bundle','meeting_bundle','birthday_bundle','buffet_bundle','event')),
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, placement),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

-- -----------------------------------------------------------------------------
-- Promotions, vouchers and loyalty
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed','free_item')),
  discount_value numeric(12,2) NOT NULL CHECK (discount_value >= 0),
  minimum_order_idr bigint NOT NULL DEFAULT 0 CHECK (minimum_order_idr >= 0),
  maximum_discount_idr bigint CHECK (maximum_discount_idr IS NULL OR maximum_discount_idr >= 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  global_quota integer CHECK (global_quota IS NULL OR global_quota >= 0),
  per_user_quota integer CHECK (per_user_quota IS NULL OR per_user_quota >= 0),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (discount_type <> 'percentage' OR discount_value <= 100)
);
CREATE TABLE IF NOT EXISTS promo_product_eligibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id uuid NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  category_id uuid REFERENCES product_categories(id) ON DELETE CASCADE,
  CHECK (product_id IS NOT NULL OR category_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS promo_eligible_product_unique_idx ON promo_product_eligibility(promo_id, product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS promo_eligible_category_unique_idx ON promo_product_eligibility(promo_id, category_id) WHERE category_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS user_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  promo_id uuid NOT NULL REFERENCES promo_campaigns(id) ON DELETE RESTRICT,
  code text UNIQUE,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','used','expired','revoked')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS user_vouchers_available_idx ON user_vouchers(user_id, expires_at) WHERE status = 'available';
CREATE TABLE IF NOT EXISTS orders_promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id uuid NOT NULL REFERENCES promo_campaigns(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  voucher_id uuid REFERENCES user_vouchers(id) ON DELETE SET NULL,
  order_id uuid UNIQUE,
  discount_idr bigint NOT NULL CHECK (discount_idr >= 0),
  redeemed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_redemptions_user_idx ON orders_promo_redemptions(promo_id, user_id, redeemed_at);

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  points_cost integer NOT NULL CHECK (points_cost > 0),
  reward_type text NOT NULL CHECK (reward_type IN ('voucher','free_product','discount')),
  reward_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS point_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  points_delta integer NOT NULL CHECK (points_delta <> 0),
  mutation_type text NOT NULL CHECK (mutation_type IN ('earn','redeem','expire','adjustment')),
  description text,
  reference_type text,
  reference_id uuid,
  idempotency_key text UNIQUE,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((mutation_type = 'earn' AND points_delta > 0) OR (mutation_type IN ('redeem','expire') AND points_delta < 0) OR mutation_type = 'adjustment')
);
CREATE INDEX IF NOT EXISTS point_ledger_user_idx ON point_ledger(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS loyalty_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reward_id uuid NOT NULL REFERENCES loyalty_rewards(id) ON DELETE RESTRICT,
  points_spent integer NOT NULL CHECK (points_spent > 0),
  voucher_id uuid REFERENCES user_vouchers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Orders, payments, fulfillment and immutable customer-facing history
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  fulfillment_type text NOT NULL CHECK (fulfillment_type IN ('delivery','pickup','dine_in')),
  order_status text NOT NULL DEFAULT 'placed' CHECK (order_status IN ('placed','accepted','preparing','ready','out_for_delivery','completed','cancelled','rejected')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','paid','partially_refunded','refunded','failed')),
  currency char(3) NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
  subtotal_idr bigint NOT NULL CHECK (subtotal_idr >= 0),
  discount_idr bigint NOT NULL DEFAULT 0 CHECK (discount_idr >= 0),
  tax_idr bigint NOT NULL DEFAULT 0 CHECK (tax_idr >= 0),
  delivery_fee_idr bigint NOT NULL DEFAULT 0 CHECK (delivery_fee_idr >= 0),
  service_fee_idr bigint NOT NULL DEFAULT 0 CHECK (service_fee_idr >= 0),
  total_idr bigint NOT NULL CHECK (total_idr >= 0),
  promo_id uuid REFERENCES promo_campaigns(id) ON DELETE SET NULL,
  voucher_id uuid REFERENCES user_vouchers(id) ON DELETE SET NULL,
  customer_notes text,
  internal_notes text,
  table_id uuid REFERENCES cafe_tables(id) ON DELETE SET NULL,
  pickup_at timestamptz,
  address_id uuid REFERENCES user_addresses(id) ON DELETE SET NULL,
  -- Delivery address snapshot protects order history if the saved address changes later.
  delivery_recipient_name text,
  delivery_recipient_phone text,
  delivery_address_snapshot jsonb,
  placed_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_idr = subtotal_idr - discount_idr + tax_idr + delivery_fee_idr + service_fee_idr),
  CHECK ((fulfillment_type <> 'delivery') OR delivery_address_snapshot IS NOT NULL),
  CHECK ((fulfillment_type <> 'dine_in') OR table_id IS NOT NULL)
);
ALTER TABLE orders_promo_redemptions
  DROP CONSTRAINT IF EXISTS orders_promo_redemptions_order_fk;
ALTER TABLE orders_promo_redemptions
  ADD CONSTRAINT orders_promo_redemptions_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS orders_user_recent_idx ON orders(user_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS orders_branch_status_idx ON orders(branch_id, order_status, placed_at DESC);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders(payment_status, placed_at DESC);
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  variant_name_snapshot text NOT NULL,
  sku_snapshot text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_idr bigint NOT NULL CHECK (unit_price_idr >= 0),
  modifiers_total_idr bigint NOT NULL DEFAULT 0 CHECK (modifiers_total_idr >= 0),
  line_total_idr bigint NOT NULL CHECK (line_total_idr >= 0),
  item_status text NOT NULL DEFAULT 'pending' CHECK (item_status IN ('pending','preparing','ready','cancelled')),
  special_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (line_total_idr = quantity * (unit_price_idr + modifiers_total_idr))
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
CREATE TABLE IF NOT EXISTS order_item_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_group_name_snapshot text NOT NULL,
  modifier_option_name_snapshot text NOT NULL,
  unit_price_delta_idr bigint NOT NULL DEFAULT 0 CHECK (unit_price_delta_idr >= 0),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  option_id uuid REFERENCES modifier_options(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_status_history_order_idx ON order_status_history(order_id, occurred_at);
CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
  event_booking_id uuid REFERENCES event_bookings(id) ON DELETE RESTRICT,
  reservation_id uuid REFERENCES reservations(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('qris','virtual_account','bank_transfer','ewallet','card','cash')),
  provider_reference text,
  idempotency_key text UNIQUE,
  transaction_type text NOT NULL DEFAULT 'charge' CHECK (transaction_type IN ('charge','refund')),
  payment_purpose text NOT NULL DEFAULT 'order' CHECK (payment_purpose IN ('order','event_deposit','event_installment','event_final','event_refund','reservation_deposit')),
  /** Tahap pembayaran untuk DP reservasi 3 tahap: DP1/DP2/pelunasan. */
  payment_stage text CHECK (payment_stage IN ('deposit','deposit2','settlement')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','expired','cancelled')),
  amount_idr bigint NOT NULL CHECK (amount_idr > 0),
  currency char(3) NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
  payment_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  raw_provider_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_reference),
  CHECK (num_nonnulls(order_id, event_booking_id, reservation_id) = 1),
  CHECK ((transaction_type = 'refund' AND payment_purpose IN ('order','event_refund')) OR
         (transaction_type = 'charge' AND payment_purpose <> 'event_refund'))
);
CREATE INDEX IF NOT EXISTS payment_transactions_order_idx ON payment_transactions(order_id, created_at DESC);
CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payment_transactions(id) ON DELETE CASCADE,
  provider_event_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_event_id)
);
CREATE TABLE IF NOT EXISTS order_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  provider text,
  tracking_code text,
  driver_name text,
  driver_phone text,
  delivery_status text NOT NULL DEFAULT 'awaiting_assignment' CHECK (delivery_status IN ('awaiting_assignment','assigned','picked_up','in_transit','delivered','failed','cancelled')),
  estimated_delivery_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS delivery_tracking_logs (
  id bigserial PRIMARY KEY,
  delivery_id uuid NOT NULL REFERENCES order_deliveries(id) ON DELETE CASCADE,
  latitude numeric(10,7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(10,7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_tracking_recent_idx ON delivery_tracking_logs(delivery_id, recorded_at DESC);

-- -----------------------------------------------------------------------------
-- Favorites, verified reviews and dining reservations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  food_rating smallint CHECK (food_rating BETWEEN 1 AND 5),
  service_rating smallint CHECK (service_rating BETWEEN 1 AND 5),
  speed_rating smallint CHECK (speed_rating BETWEEN 1 AND 5),
  review_text text,
  moderation_status text NOT NULL DEFAULT 'visible' CHECK (moderation_status IN ('visible','hidden','flagged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (food_rating IS NOT NULL OR service_rating IS NOT NULL OR speed_rating IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS reviews_product_recent_idx ON reviews(product_id, created_at DESC);
CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  area_id uuid REFERENCES dining_areas(id) ON DELETE SET NULL,
  reserved_for timestamptz NOT NULL,
  duration_minutes smallint NOT NULL DEFAULT 120 CHECK (duration_minutes BETWEEN 15 AND 720),
  guest_count smallint NOT NULL CHECK (guest_count > 0),
  seating_preference text CHECK (seating_preference IN ('indoor','outdoor','private_room','any')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','seated','completed','cancelled','no_show')),
  special_requests text,
  -- Kontak yang diisi pelanggan pada form reservasi. Bisa berbeda dari data
  -- akun (mis. nomor PIC acara), jadi disimpan terpisah dan dipakai admin.
  contact_name text,
  contact_phone text,
  -- Sewa ruangan: total = harga_per_jam × jumlah jam (dipotret saat dibuat).
  area_price_per_hour_idr bigint,
  total_estimate_idr bigint,
  -- Pemecahan total Estimate: sewa ruangan + order menu (makanan/minuman).
  -- DP1/DP2/pelunasan dihitung dari TOTAL (sewa + menu), jadi uang muka
  -- mencakup makanan & minuman yang dipesan pelanggan, bukan sewa saja.
  room_total_idr bigint,
  menu_total_idr bigint,
  -- Uang muka (DP) 3 tahap:
  --   deposit_*        = DP1 (dibayar saat mengisi formulir, flat × jumlah ruangan)
  --   deposit2_*       = DP2 (setelah reservasi dikonfirmasi, % dari total_estimate_idr)
  --   settlement_*     = Pelunasan (sisa total)
  deposit_amount_idr bigint,
  deposit_status text NOT NULL DEFAULT 'unpaid' CHECK (deposit_status IN ('unpaid','pending','paid','refunded')),
  deposit_proof_url text,
  deposit_proof_storage_key text,
  deposit_paid_at timestamptz,
  deposit_note text,
  deposit2_amount_idr bigint,
  deposit2_status text NOT NULL DEFAULT 'unpaid' CHECK (deposit2_status IN ('unpaid','pending','paid','refunded')),
  deposit2_proof_url text,
  deposit2_proof_storage_key text,
  deposit2_paid_at timestamptz,
  deposit2_note text,
  settlement_amount_idr bigint,
  settlement_status text NOT NULL DEFAULT 'unpaid' CHECK (settlement_status IN ('unpaid','pending','paid','refunded')),
  settlement_proof_url text,
  settlement_proof_storage_key text,
  settlement_paid_at timestamptz,
  settlement_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservations_branch_time_idx ON reservations(branch_id, reserved_for, status);

-- Pengaturan persentase DP reservasi (satu baris, id = 1).
-- DP1 = clamp(dp1_percent% × total, dp1_min_idr, dp1_max_idr)
-- DP2 = dp2_percent% × sisa setelah DP1
-- Pelunasan = sisa setelah DP1 & DP2 (otomatis).
-- Nilai awal mengikuti rumus lama: 30%, min Rp300.000, max Rp500.000, DP2 30%.
CREATE TABLE IF NOT EXISTS reservation_deposit_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dp1_percent numeric(5,2) NOT NULL DEFAULT 30 CHECK (dp1_percent >= 0 AND dp1_percent <= 100),
  dp1_min_idr bigint NOT NULL DEFAULT 300000 CHECK (dp1_min_idr >= 0),
  dp1_max_idr bigint NOT NULL DEFAULT 500000 CHECK (dp1_max_idr >= 0),
  dp2_percent numeric(5,2) NOT NULL DEFAULT 30 CHECK (dp2_percent >= 0 AND dp2_percent <= 100),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_deposit_settings_range_ck CHECK (dp1_min_idr <= dp1_max_idr)
);
INSERT INTO reservation_deposit_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Salinan di schema `public` (runtime app memakai search_path default → public).
CREATE TABLE IF NOT EXISTS public.reservation_deposit_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dp1_percent numeric(5,2) NOT NULL DEFAULT 30 CHECK (dp1_percent >= 0 AND dp1_percent <= 100),
  dp1_min_idr bigint NOT NULL DEFAULT 300000 CHECK (dp1_min_idr >= 0),
  dp1_max_idr bigint NOT NULL DEFAULT 500000 CHECK (dp1_max_idr >= 0),
  dp2_percent numeric(5,2) NOT NULL DEFAULT 30 CHECK (dp2_percent >= 0 AND dp2_percent <= 100),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_deposit_settings_range_ck CHECK (dp1_min_idr <= dp1_max_idr)
);
INSERT INTO public.reservation_deposit_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Riwayat perubahan status + catatan staff (untuk notifikasi & jejak audit).
CREATE TABLE IF NOT EXISTS reservation_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservation_status_history_res_idx ON reservation_status_history(reservation_id, created_at DESC);

-- Migrasi idempoten untuk instalasi lama (kolom DP & riwayat status).
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_amount_idr bigint;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_proof_url text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_proof_storage_key text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_note text;
-- Sewa ruangan + DP 3 tahap (DP1 sudah ada di kolom deposit_*).
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS area_price_per_hour_idr bigint;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS total_estimate_idr bigint;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit2_amount_idr bigint;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit2_status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit2_proof_url text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit2_proof_storage_key text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit2_paid_at timestamptz;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit2_note text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS settlement_amount_idr bigint;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS settlement_proof_url text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS settlement_proof_storage_key text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS settlement_paid_at timestamptz;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS settlement_note text;
-- Pemecahan total: sewa ruangan + order menu (makanan/minuman). DP dihitung
-- dari total gabungan, jadi uang muka ikut menutup menu yang dipesan.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS room_total_idr bigint;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS menu_total_idr bigint;
-- Kontak pelanggan saat reservasi (nama & nomor telepon yang diisi di form).
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS contact_phone text;
-- Order menu yang menyertai reservasi (makanan/minuman).
CREATE TABLE IF NOT EXISTS reservation_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  product_id uuid,
  variant_id uuid,
  product_name text NOT NULL,
  variant_name text,
  quantity smallint NOT NULL CHECK (quantity > 0),
  unit_price_idr bigint NOT NULL,
  modifiers_total_idr bigint NOT NULL DEFAULT 0,
  line_total_idr bigint NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservation_menu_items_res_idx ON reservation_menu_items(reservation_id);
CREATE TABLE IF NOT EXISTS reservation_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservation_status_history_res_idx ON reservation_status_history(reservation_id, created_at DESC);
-- Salinan di schema `public` (runtime app memakai search_path default → public).
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS deposit_amount_idr bigint;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS deposit_status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS deposit_proof_url text;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS deposit_proof_storage_key text;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS deposit_note text;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS area_price_per_hour_idr bigint;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS total_estimate_idr bigint;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS deposit2_amount_idr bigint;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS deposit2_status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS deposit2_proof_url text;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS deposit2_proof_storage_key text;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS deposit2_paid_at timestamptz;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS deposit2_note text;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS settlement_amount_idr bigint;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS settlement_proof_url text;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS settlement_proof_storage_key text;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS settlement_paid_at timestamptz;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS settlement_note text;
-- Pemecahan total: sewa ruangan + order menu (makanan/minuman).
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS room_total_idr bigint;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS menu_total_idr bigint;
-- Kontak pelanggan saat reservasi (nama & nomor telepon yang diisi di form).
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS contact_phone text;
-- Order menu reservasi — salinan di schema `public` (runtime app memakai
-- search_path default → public).
CREATE TABLE IF NOT EXISTS public.reservation_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  product_id uuid,
  variant_id uuid,
  product_name text NOT NULL,
  variant_name text,
  quantity smallint NOT NULL CHECK (quantity > 0),
  unit_price_idr bigint NOT NULL,
  modifiers_total_idr bigint NOT NULL DEFAULT 0,
  line_total_idr bigint NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservation_menu_items_res_public_idx ON public.reservation_menu_items(reservation_id);
CREATE TABLE IF NOT EXISTS public.reservation_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservation_status_history_res_public_idx ON public.reservation_status_history(reservation_id, created_at DESC);

-- Migrasi idempoten: email cabang + pembayaran DP reservasi (Midtrans).
ALTER TABLE branches ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS event_booking_id uuid;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS reservation_id uuid;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS payment_stage text;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS payment_stage text;
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_exactly_one_parent_ck;
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_purpose_parent_ck;
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_payment_purpose_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_payment_purpose_check
    CHECK (payment_purpose IN ('order','event_deposit','event_installment','event_final','event_refund','reservation_deposit'));
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_exactly_one_parent_ck
    CHECK (num_nonnulls(order_id, event_booking_id, reservation_id) = 1),
  ADD CONSTRAINT payment_transactions_purpose_parent_ck
    CHECK ((order_id IS NOT NULL AND payment_purpose = 'order') OR
           (event_booking_id IS NOT NULL AND payment_purpose <> 'order') OR
           (reservation_id IS NOT NULL AND payment_purpose = 'reservation_deposit'));
CREATE INDEX IF NOT EXISTS payment_transactions_reservation_public_idx ON public.payment_transactions(reservation_id, created_at DESC);
CREATE TABLE IF NOT EXISTS reservation_tables (
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES cafe_tables(id) ON DELETE RESTRICT,
  PRIMARY KEY (reservation_id, table_id)
);
-- Reservasi per-ruangan: satu reservasi bisa memesan beberapa area (ruangan).
CREATE TABLE IF NOT EXISTS reservation_rooms (
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES dining_areas(id) ON DELETE RESTRICT,
  PRIMARY KEY (reservation_id, area_id)
);
CREATE INDEX IF NOT EXISTS reservation_rooms_area_idx ON reservation_rooms(area_id);
CREATE TABLE IF NOT EXISTS public.reservation_rooms (
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.dining_areas(id) ON DELETE RESTRICT,
  PRIMARY KEY (reservation_id, area_id)
);
CREATE INDEX IF NOT EXISTS reservation_rooms_area_public_idx ON public.reservation_rooms(area_id);

-- -----------------------------------------------------------------------------
-- Events, party packages and per-person catering/buffet packages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  base_price_idr bigint NOT NULL DEFAULT 0 CHECK (base_price_idr >= 0),
  minimum_guests integer NOT NULL DEFAULT 1 CHECK (minimum_guests > 0),
  maximum_guests integer CHECK (maximum_guests IS NULL OR maximum_guests >= minimum_guests),
  inclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS catering_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_per_person_idr bigint NOT NULL CHECK (price_per_person_idr >= 0),
  minimum_guests integer NOT NULL DEFAULT 1 CHECK (minimum_guests > 0),
  maximum_guests integer CHECK (maximum_guests IS NULL OR maximum_guests >= minimum_guests),
  menu_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  lead_time_hours integer NOT NULL DEFAULT 24 CHECK (lead_time_hours >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS event_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  event_package_id uuid REFERENCES event_packages(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('birthday','arisan','meeting','gathering','engagement','wedding','seminar','reunion','bukber','family_gathering','other')),
  event_name text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  guest_count integer NOT NULL CHECK (guest_count > 0),
  event_package_name_snapshot text,
  event_package_price_snapshot_idr bigint NOT NULL DEFAULT 0 CHECK (event_package_price_snapshot_idr >= 0),
  subtotal_idr bigint NOT NULL CHECK (subtotal_idr >= 0),
  deposit_idr bigint NOT NULL DEFAULT 0 CHECK (deposit_idr >= 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','quoted','awaiting_deposit','confirmed','in_progress','completed','cancelled')),
  custom_requests text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
-- Pembayaran DP reservasi: transaksi bisa terkait order, event, atau reservasi.
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS event_booking_id uuid REFERENCES event_bookings(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES reservations(id) ON DELETE RESTRICT;
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_exactly_one_parent_ck;
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_purpose_parent_ck;
ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_exactly_one_parent_ck
    CHECK (num_nonnulls(order_id, event_booking_id, reservation_id) = 1),
  ADD CONSTRAINT payment_transactions_purpose_parent_ck
    CHECK ((order_id IS NOT NULL AND payment_purpose = 'order') OR
           (event_booking_id IS NOT NULL AND payment_purpose <> 'order') OR
           (reservation_id IS NOT NULL AND payment_purpose = 'reservation_deposit'));
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_payment_purpose_check;
ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_payment_purpose_check
    CHECK (payment_purpose IN ('order','event_deposit','event_installment','event_final','event_refund','reservation_deposit'));
CREATE INDEX IF NOT EXISTS payment_transactions_reservation_idx ON payment_transactions(reservation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS event_bookings_branch_date_idx ON event_bookings(branch_id, starts_at, status);
CREATE TABLE IF NOT EXISTS event_booking_catering (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_booking_id uuid NOT NULL REFERENCES event_bookings(id) ON DELETE CASCADE,
  catering_package_id uuid REFERENCES catering_packages(id) ON DELETE SET NULL,
  package_name_snapshot text NOT NULL,
  price_per_person_snapshot_idr bigint NOT NULL CHECK (price_per_person_snapshot_idr >= 0),
  guest_count integer NOT NULL CHECK (guest_count > 0),
  line_total_idr bigint NOT NULL CHECK (line_total_idr = price_per_person_snapshot_idr * guest_count)
);
CREATE TABLE IF NOT EXISTS event_booking_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_booking_id uuid NOT NULL REFERENCES event_bookings(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_idr bigint NOT NULL CHECK (unit_price_idr >= 0),
  line_total_idr bigint NOT NULL CHECK (line_total_idr = quantity * unit_price_idr)
);
-- Agenda event internal (Ramadan, Lebaran, promo musiman, dsb). Ditampilkan di
-- panel admin sebagai penanda tanggal; boleh tumpang tindih antar event.
CREATE TABLE IF NOT EXISTS event_agenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  description text,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS event_agenda_dates_idx ON event_agenda(starts_on, ends_on);
CREATE INDEX IF NOT EXISTS event_agenda_active_idx ON event_agenda(is_active, starts_on);
-- Salinan di schema `public` (runtime app memakai search_path default → public).
CREATE TABLE IF NOT EXISTS public.event_agenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  description text,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS event_agenda_dates_public_idx ON public.event_agenda(starts_on, ends_on);
CREATE INDEX IF NOT EXISTS event_agenda_active_public_idx ON public.event_agenda(is_active, starts_on);
-- -----------------------------------------------------------------------------
-- Inventory ledger and recipes (quantities stored in each ingredient's base unit)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  base_unit text NOT NULL,
  reorder_level numeric(14,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  is_active boolean NOT NULL DEFAULT true,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_contact text,
  purchase_link text,
  last_purchase_price_idr bigint NOT NULL DEFAULT 0,
  last_purchase_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (last_purchase_qty >= 0),
  last_purchase_uom text,
  last_yield_amount numeric(14,3) NOT NULL DEFAULT 0 CHECK (last_yield_amount >= 0),
  last_unit_cost_idr bigint NOT NULL DEFAULT 0 CHECK (last_unit_cost_idr >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS recipes (
  product_variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity_in_base_unit numeric(14,3) NOT NULL CHECK (quantity_in_base_unit > 0),
  expected_waste_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (expected_waste_percent BETWEEN 0 AND 100),
  PRIMARY KEY (product_variant_id, ingredient_id)
);
CREATE TABLE IF NOT EXISTS stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  UNIQUE (name)
);

-- Lokasi stok mandiri (tidak terikat cabang)
ALTER TABLE stock_locations DROP CONSTRAINT IF EXISTS stock_locations_branch_id_fkey;
ALTER TABLE stock_locations DROP CONSTRAINT IF EXISTS stock_locations_branch_id_name_key;
ALTER TABLE stock_locations DROP COLUMN IF EXISTS branch_id;
CREATE UNIQUE INDEX IF NOT EXISTS stock_locations_name_key ON stock_locations(name);

-- Salinan di schema `public` (runtime app memakai search_path default → public).
CREATE TABLE IF NOT EXISTS public.stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  UNIQUE (name)
);
ALTER TABLE public.stock_locations DROP CONSTRAINT IF EXISTS stock_locations_branch_id_fkey;
ALTER TABLE public.stock_locations DROP CONSTRAINT IF EXISTS stock_locations_branch_id_name_key;
ALTER TABLE public.stock_locations DROP COLUMN IF EXISTS branch_id;
CREATE UNIQUE INDEX IF NOT EXISTS stock_locations_name_key ON public.stock_locations(name);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_location_id uuid NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity_delta numeric(14,3) NOT NULL CHECK (quantity_delta <> 0),
  movement_type text NOT NULL CHECK (movement_type IN ('purchase','order_consumption','waste','adjustment','transfer_in','transfer_out')),
  reference_type text,
  reference_id uuid,
  notes text,
  movement_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_movements_stock_idx ON inventory_movements(stock_location_id, ingredient_id, created_at DESC);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS movement_date date;
UPDATE inventory_movements
   SET movement_date = (created_at AT TIME ZONE 'Asia/Jakarta')::date
 WHERE movement_date IS NULL;
ALTER TABLE inventory_movements ALTER COLUMN movement_date SET DEFAULT CURRENT_DATE;
CREATE INDEX IF NOT EXISTS inventory_movements_date_idx ON inventory_movements(movement_date DESC);

-- Salinan di schema `public` (runtime app memakai search_path default → public).
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS movement_date date;
UPDATE public.inventory_movements
   SET movement_date = (created_at AT TIME ZONE 'Asia/Jakarta')::date
  WHERE movement_date IS NULL;
ALTER TABLE public.inventory_movements ALTER COLUMN movement_date SET DEFAULT CURRENT_DATE;
CREATE INDEX IF NOT EXISTS inventory_movements_date_public_idx ON public.inventory_movements(movement_date DESC);

-- Harga beli terakhir per bahan (dipakai sebagai default harga PO berikutnya).
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS last_purchase_price_idr bigint NOT NULL DEFAULT 0;
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS last_purchase_price_idr bigint NOT NULL DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_contact text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS purchase_link text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS last_purchase_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (last_purchase_qty >= 0);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS last_purchase_uom text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS last_yield_amount numeric(14,3) NOT NULL DEFAULT 0 CHECK (last_yield_amount >= 0);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS last_unit_cost_idr bigint NOT NULL DEFAULT 0 CHECK (last_unit_cost_idr >= 0);
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS supplier_contact text;
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS purchase_link text;
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS last_purchase_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (last_purchase_qty >= 0);
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS last_purchase_uom text;
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS last_yield_amount numeric(14,3) NOT NULL DEFAULT 0 CHECK (last_yield_amount >= 0);
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS last_unit_cost_idr bigint NOT NULL DEFAULT 0 CHECK (last_unit_cost_idr >= 0);

-- -----------------------------------------------------------------------------
-- Stok keluar (transfer gudang → outlet) dan stok opname
-- Dokumen draft belum mengubah stok; posting menerapkan mutasi secara atomik.
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS stock_out_number_seq;
CREATE SEQUENCE IF NOT EXISTS stock_opname_number_seq;

CREATE TABLE IF NOT EXISTS stock_out_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  from_stock_location_id uuid NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
  to_stock_location_id uuid NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  cancel_reason text,
  posted_at timestamptz,
  posted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_stock_location_id <> to_stock_location_id)
);
CREATE INDEX IF NOT EXISTS stock_out_documents_date_idx ON stock_out_documents(transfer_date DESC);
CREATE INDEX IF NOT EXISTS stock_out_documents_status_idx ON stock_out_documents(status);
CREATE INDEX IF NOT EXISTS stock_out_documents_locations_idx ON stock_out_documents(from_stock_location_id, to_stock_location_id);

CREATE TABLE IF NOT EXISTS stock_out_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_out_id uuid NOT NULL REFERENCES stock_out_documents(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_out_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS stock_out_items_document_idx ON stock_out_items(stock_out_id, sort_order);

CREATE TABLE IF NOT EXISTS stock_opname_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  stock_location_id uuid NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
  opname_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  cancel_reason text,
  posted_at timestamptz,
  posted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_opname_documents_date_idx ON stock_opname_documents(opname_date DESC);
CREATE INDEX IF NOT EXISTS stock_opname_documents_status_idx ON stock_opname_documents(status);
CREATE INDEX IF NOT EXISTS stock_opname_documents_location_idx ON stock_opname_documents(stock_location_id);

CREATE TABLE IF NOT EXISTS stock_opname_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_opname_id uuid NOT NULL REFERENCES stock_opname_documents(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  system_quantity numeric(14,3) NOT NULL DEFAULT 0,
  counted_quantity numeric(14,3) NOT NULL CHECK (counted_quantity >= 0),
  difference_quantity numeric(14,3) NOT NULL DEFAULT 0,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_opname_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS stock_opname_items_document_idx ON stock_opname_items(stock_opname_id, sort_order);

DROP TRIGGER IF EXISTS stock_out_documents_updated_at ON stock_out_documents;
CREATE TRIGGER stock_out_documents_updated_at BEFORE UPDATE ON stock_out_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS stock_opname_documents_updated_at ON stock_opname_documents;
CREATE TRIGGER stock_opname_documents_updated_at BEFORE UPDATE ON stock_opname_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Salinan di schema `public` (runtime app memakai search_path default → public).
CREATE SEQUENCE IF NOT EXISTS public.stock_out_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.stock_opname_number_seq;

CREATE TABLE IF NOT EXISTS public.stock_out_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  from_stock_location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  to_stock_location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  cancel_reason text,
  posted_at timestamptz,
  posted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_stock_location_id <> to_stock_location_id)
);
CREATE INDEX IF NOT EXISTS stock_out_documents_date_public_idx ON public.stock_out_documents(transfer_date DESC);
CREATE INDEX IF NOT EXISTS stock_out_documents_status_public_idx ON public.stock_out_documents(status);
CREATE INDEX IF NOT EXISTS stock_out_documents_locations_public_idx ON public.stock_out_documents(from_stock_location_id, to_stock_location_id);

CREATE TABLE IF NOT EXISTS public.stock_out_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_out_id uuid NOT NULL REFERENCES public.stock_out_documents(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_out_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS stock_out_items_document_public_idx ON public.stock_out_items(stock_out_id, sort_order);

CREATE TABLE IF NOT EXISTS public.stock_opname_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  stock_location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
  opname_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  cancel_reason text,
  posted_at timestamptz,
  posted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_opname_documents_date_public_idx ON public.stock_opname_documents(opname_date DESC);
CREATE INDEX IF NOT EXISTS stock_opname_documents_status_public_idx ON public.stock_opname_documents(status);
CREATE INDEX IF NOT EXISTS stock_opname_documents_location_public_idx ON public.stock_opname_documents(stock_location_id);

CREATE TABLE IF NOT EXISTS public.stock_opname_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_opname_id uuid NOT NULL REFERENCES public.stock_opname_documents(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  system_quantity numeric(14,3) NOT NULL DEFAULT 0,
  counted_quantity numeric(14,3) NOT NULL CHECK (counted_quantity >= 0),
  difference_quantity numeric(14,3) NOT NULL DEFAULT 0,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_opname_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS stock_opname_items_document_public_idx ON public.stock_opname_items(stock_opname_id, sort_order);

DROP TRIGGER IF EXISTS stock_out_documents_updated_at ON public.stock_out_documents;
CREATE TRIGGER stock_out_documents_updated_at BEFORE UPDATE ON public.stock_out_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS stock_opname_documents_updated_at ON public.stock_opname_documents;
CREATE TRIGGER stock_opname_documents_updated_at BEFORE UPDATE ON public.stock_opname_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Purchasing: supplier master, purchase orders, goods receipts, supplier payments
-- Nilai uang integer rupiah; kuantitas mengikuti satuan dasar bahan.
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS supplier_code_seq;
CREATE SEQUENCE IF NOT EXISTS purchase_order_number_seq;
CREATE SEQUENCE IF NOT EXISTS goods_receipt_number_seq;

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','ordered','partial','received','cancelled')),
  payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','partial','paid')),
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_date date,
  due_date date,
  subtotal_idr bigint NOT NULL DEFAULT 0 CHECK (subtotal_idr >= 0),
  discount_idr bigint NOT NULL DEFAULT 0 CHECK (discount_idr >= 0),
  tax_idr bigint NOT NULL DEFAULT 0 CHECK (tax_idr >= 0),
  total_idr bigint NOT NULL DEFAULT 0 CHECK (total_idr >= 0),
  paid_amount_idr bigint NOT NULL DEFAULT 0 CHECK (paid_amount_idr >= 0),
  notes text,
  cancel_reason text,
  confirmed_at timestamptz,
  received_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx ON purchase_orders(supplier_id, order_date DESC);
CREATE INDEX IF NOT EXISTS purchase_orders_status_idx ON purchase_orders(status, payment_status);
CREATE INDEX IF NOT EXISTS purchase_orders_date_idx ON purchase_orders(order_date DESC);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  quantity_received numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_price_idr bigint NOT NULL DEFAULT 0 CHECK (unit_price_idr >= 0),
  line_total_idr bigint NOT NULL DEFAULT 0 CHECK (line_total_idr >= 0),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS purchase_order_items_po_idx ON purchase_order_items(purchase_order_id, sort_order);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  stock_location_id uuid NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','cancelled')),
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  posted_at timestamptz,
  posted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goods_receipts_po_idx ON goods_receipts(purchase_order_id, received_date DESC);
CREATE INDEX IF NOT EXISTS goods_receipts_date_idx ON goods_receipts(received_date DESC);
CREATE INDEX IF NOT EXISTS goods_receipts_status_idx ON goods_receipts(status);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id uuid NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid NOT NULL REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price_idr bigint NOT NULL DEFAULT 0 CHECK (unit_price_idr >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goods_receipt_id, purchase_order_item_id)
);
CREATE INDEX IF NOT EXISTS goods_receipt_items_receipt_idx ON goods_receipt_items(goods_receipt_id);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  amount_idr bigint NOT NULL CHECK (amount_idr > 0),
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'transfer' CHECK (method IN ('transfer','cash','qris','other')),
  reference text,
  proof_url text,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_payments_po_idx ON supplier_payments(purchase_order_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS supplier_payments_date_idx ON supplier_payments(paid_at DESC);

DROP TRIGGER IF EXISTS suppliers_updated_at ON suppliers;
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS goods_receipts_updated_at ON goods_receipts;
CREATE TRIGGER goods_receipts_updated_at BEFORE UPDATE ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Salinan di schema `public` (runtime app memakai search_path default → public).
CREATE SEQUENCE IF NOT EXISTS public.supplier_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.purchase_order_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.goods_receipt_number_seq;

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','ordered','partial','received','cancelled')),
  payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','partial','paid')),
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_date date,
  due_date date,
  subtotal_idr bigint NOT NULL DEFAULT 0 CHECK (subtotal_idr >= 0),
  discount_idr bigint NOT NULL DEFAULT 0 CHECK (discount_idr >= 0),
  tax_idr bigint NOT NULL DEFAULT 0 CHECK (tax_idr >= 0),
  total_idr bigint NOT NULL DEFAULT 0 CHECK (total_idr >= 0),
  paid_amount_idr bigint NOT NULL DEFAULT 0 CHECK (paid_amount_idr >= 0),
  notes text,
  cancel_reason text,
  confirmed_at timestamptz,
  received_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_orders_supplier_public_idx ON public.purchase_orders(supplier_id, order_date DESC);
CREATE INDEX IF NOT EXISTS purchase_orders_status_public_idx ON public.purchase_orders(status, payment_status);
CREATE INDEX IF NOT EXISTS purchase_orders_date_public_idx ON public.purchase_orders(order_date DESC);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  quantity_received numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_price_idr bigint NOT NULL DEFAULT 0 CHECK (unit_price_idr >= 0),
  line_total_idr bigint NOT NULL DEFAULT 0 CHECK (line_total_idr >= 0),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS purchase_order_items_po_public_idx ON public.purchase_order_items(purchase_order_id, sort_order);

CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  stock_location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','cancelled')),
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  posted_at timestamptz,
  posted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goods_receipts_po_public_idx ON public.goods_receipts(purchase_order_id, received_date DESC);
CREATE INDEX IF NOT EXISTS goods_receipts_date_public_idx ON public.goods_receipts(received_date DESC);
CREATE INDEX IF NOT EXISTS goods_receipts_status_public_idx ON public.goods_receipts(status);

CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price_idr bigint NOT NULL DEFAULT 0 CHECK (unit_price_idr >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goods_receipt_id, purchase_order_item_id)
);
CREATE INDEX IF NOT EXISTS goods_receipt_items_receipt_public_idx ON public.goods_receipt_items(goods_receipt_id);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  amount_idr bigint NOT NULL CHECK (amount_idr > 0),
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'transfer' CHECK (method IN ('transfer','cash','qris','other')),
  reference text,
  proof_url text,
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_payments_po_public_idx ON public.supplier_payments(purchase_order_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS supplier_payments_date_public_idx ON public.supplier_payments(paid_at DESC);

DROP TRIGGER IF EXISTS suppliers_updated_at ON public.suppliers;
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS goods_receipts_updated_at ON public.goods_receipts;
CREATE TRIGGER goods_receipts_updated_at BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Community moments, notifications, support chat, gamification and AI assistant
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS semoet_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text,
  caption text,
  event_type text CHECK (event_type IN ('community','birthday','wedding','event','other')),
  moderation_status text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected','hidden')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS semoet_moment_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES semoet_moments(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  public_url text,
  media_type text NOT NULL CHECK (media_type IN ('image','video')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('fcm','apns','web_push')),
  token_hash text NOT NULL UNIQUE,
  device_label text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('in_app','push','email','sms')),
  title text NOT NULL,
  body text NOT NULL,
  action_url text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','read')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_recent_idx ON notifications(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_staff_id uuid REFERENCES users(id) ON DELETE SET NULL,
  topic text NOT NULL,
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general','complaint')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','waiting','resolved','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_category_check;
ALTER TABLE chat_conversations
  ADD CONSTRAINT chat_conversations_category_check CHECK (category IN ('general','complaint'));

-- Salinan di schema `public` (runtime app memakai search_path default → public).
ALTER TABLE public.chat_conversations ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE public.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_category_check;
ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_category_check CHECK (category IN ('general','complaint'));
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('customer','staff','assistant','system')),
  sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  attachment_storage_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((sender_type IN ('customer','staff') AND sender_user_id IS NOT NULL) OR (sender_type IN ('assistant','system') AND sender_user_id IS NULL))
);
CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages(conversation_id, created_at);

-- Penanda terkirim/dibaca (read receipt). `delivered_at` diisi saat penerima
-- memuat thread, `read_at` saat pesan benar-benar tampil di layar penerima.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Salinan di schema `public` (runtime backend memakai search_path default → public).
ALTER TABLE IF EXISTS public.chat_messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE IF EXISTS public.chat_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE TABLE IF NOT EXISTS gamification_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('daily_checkin','spin_wheel','challenge','other')),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS gamification_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES gamification_activities(id) ON DELETE CASCADE,
  reward_type text NOT NULL CHECK (reward_type IN ('points','voucher','free_product','none')),
  reward_value integer NOT NULL DEFAULT 0 CHECK (reward_value >= 0),
  weight integer NOT NULL DEFAULT 1 CHECK (weight >= 0),
  config jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS gamification_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  activity_id uuid NOT NULL REFERENCES gamification_activities(id) ON DELETE RESTRICT,
  reward_id uuid REFERENCES gamification_rewards(id) ON DELETE SET NULL,
  played_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text UNIQUE,
  result jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  purpose text NOT NULL CHECK (purpose IN ('customer_support','admin_assistant')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_query_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES ai_conversations(id) ON DELETE SET NULL,
  admin_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  model_name text NOT NULL,
  prompt_tokens integer CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  completion_tokens integer CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  outcome text NOT NULL CHECK (outcome IN ('success','error','blocked')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Audit and reporting foundations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  request_id text,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_user_id, created_at DESC);

-- Views provide dashboard aggregates without storing stale duplicate totals.
CREATE OR REPLACE VIEW daily_order_sales AS
SELECT branch_id, (placed_at AT TIME ZONE 'Asia/Jakarta')::date AS business_date,
       count(*) FILTER (WHERE order_status <> 'cancelled') AS order_count,
       coalesce(sum(total_idr) FILTER (WHERE payment_status = 'paid' AND order_status <> 'cancelled'), 0) AS paid_sales_idr
FROM orders
GROUP BY branch_id, (placed_at AT TIME ZONE 'Asia/Jakarta')::date;

-- Maintain updated_at consistently on mutable records.
DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS customer_profiles_updated_at ON customer_profiles;
CREATE TRIGGER customer_profiles_updated_at BEFORE UPDATE ON customer_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS user_addresses_updated_at ON user_addresses;
CREATE TRIGGER user_addresses_updated_at BEFORE UPDATE ON user_addresses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS branches_updated_at ON branches;
CREATE TRIGGER branches_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS product_variants_updated_at ON product_variants;
CREATE TRIGGER product_variants_updated_at BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS payment_transactions_updated_at ON payment_transactions;
CREATE TRIGGER payment_transactions_updated_at BEFORE UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS order_deliveries_updated_at ON order_deliveries;
CREATE TRIGGER order_deliveries_updated_at BEFORE UPDATE ON order_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS reviews_updated_at ON reviews;
CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS reservations_updated_at ON reservations;
CREATE TRIGGER reservations_updated_at BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS reservation_deposit_settings_updated_at ON reservation_deposit_settings;
CREATE TRIGGER reservation_deposit_settings_updated_at BEFORE UPDATE ON reservation_deposit_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS reservation_deposit_settings_updated_at ON public.reservation_deposit_settings;
CREATE TRIGGER reservation_deposit_settings_updated_at BEFORE UPDATE ON public.reservation_deposit_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS event_packages_updated_at ON event_packages;
CREATE TRIGGER event_packages_updated_at BEFORE UPDATE ON event_packages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS catering_packages_updated_at ON catering_packages;
CREATE TRIGGER catering_packages_updated_at BEFORE UPDATE ON catering_packages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS event_bookings_updated_at ON event_bookings;
CREATE TRIGGER event_bookings_updated_at BEFORE UPDATE ON event_bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS event_agenda_updated_at ON event_agenda;
CREATE TRIGGER event_agenda_updated_at BEFORE UPDATE ON event_agenda FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS event_agenda_updated_at ON public.event_agenda;
CREATE TRIGGER event_agenda_updated_at BEFORE UPDATE ON public.event_agenda FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS ingredients_updated_at ON ingredients;
CREATE TRIGGER ingredients_updated_at BEFORE UPDATE ON ingredients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS chat_conversations_updated_at ON chat_conversations;
CREATE TRIGGER chat_conversations_updated_at BEFORE UPDATE ON chat_conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Pengeluaran operasional (kategori sewa, utilitas, gaji, promosi, dll.)
-- Nilai uang integer rupiah; bukan bagian dari perhitungan HPP produk.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL
    CHECK (category IN ('bahan_baku','alat_alat_masak','kemasan','utilitas','sewa','gaji','pemasaran','transportasi','lainnya')),
  name text NOT NULL DEFAULT '',
  amount_idr bigint NOT NULL CHECK (amount_idr > 0),
  note text,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS expenses_category_idx ON expenses(category, expense_date DESC);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
-- Salinan di schema `public` (runtime app memakai search_path default → public).
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL
    CHECK (category IN ('bahan_baku','alat_alat_masak','kemasan','utilitas','sewa','gaji','pemasaran','transportasi','lainnya')),
  name text NOT NULL DEFAULT '',
  amount_idr bigint NOT NULL CHECK (amount_idr > 0),
  note text,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_date_public_idx ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS expenses_category_public_idx ON public.expenses(category, expense_date DESC);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS due_date date;
CREATE INDEX IF NOT EXISTS purchase_orders_due_date_idx ON purchase_orders(due_date);
CREATE INDEX IF NOT EXISTS purchase_orders_due_date_public_idx ON public.purchase_orders(due_date);

-- -----------------------------------------------------------------------------
-- Shift kasir
-- Satu shift mewakili satu akun staf yang bertugas di satu cabang. Hanya boleh
-- ada satu shift terbuka per cabang dan per akun staf pada waktu yang sama.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  staff_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  opening_cash_idr bigint NOT NULL DEFAULT 0 CHECK (opening_cash_idr >= 0),
  closing_cash_idr bigint CHECK (closing_cash_idr IS NULL OR closing_cash_idr >= 0),
  notes text,
  closing_notes text,
  opened_by uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closed_at IS NULL OR closed_at >= opened_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_branch_idx
  ON shifts(branch_id) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_staff_idx
  ON shifts(staff_user_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS shifts_branch_opened_idx
  ON shifts(branch_id, opened_at DESC);

-- Salinan di schema `public` (runtime app memakai search_path default → public).
CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  staff_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  opening_cash_idr bigint NOT NULL DEFAULT 0 CHECK (opening_cash_idr >= 0),
  closing_cash_idr bigint CHECK (closing_cash_idr IS NULL OR closing_cash_idr >= 0),
  notes text,
  closing_notes text,
  opened_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  closed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closed_at IS NULL OR closed_at >= opened_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_branch_public_idx
  ON public.shifts(branch_id) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_staff_public_idx
  ON public.shifts(staff_user_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS shifts_branch_opened_public_idx
  ON public.shifts(branch_id, opened_at DESC);

-- Kolom jam rencana untuk database yang sudah memiliki tabel shifts.
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS planned_start_at timestamptz;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS planned_end_at timestamptz;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS planned_start_at timestamptz;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS planned_end_at timestamptz;

DROP TRIGGER IF EXISTS shifts_updated_at ON shifts;
CREATE TRIGGER shifts_updated_at BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS shifts_updated_at ON public.shifts;
CREATE TRIGGER shifts_updated_at BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Status buka/tutup toko per cabang
-- `mode = auto` mengikuti branch_business_hours, sedangkan `open`/`closed`
-- adalah override manual yang bertahan sampai diubah kembali.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_store_status (
  branch_id uuid PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto','open','closed')),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Salinan di schema `public` (runtime app memakai search_path default → public).
CREATE TABLE IF NOT EXISTS public.branch_store_status (
  branch_id uuid PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto','open','closed')),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS branch_store_status_updated_at ON branch_store_status;
CREATE TRIGGER branch_store_status_updated_at BEFORE UPDATE ON branch_store_status
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS branch_store_status_updated_at ON public.branch_store_status;
CREATE TRIGGER branch_store_status_updated_at BEFORE UPDATE ON public.branch_store_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Pastikan salinan public branch_business_hours tersedia untuk runtime yang
-- memakai search_path default. Tabel ini sudah dipakai endpoint cabang.
CREATE TABLE IF NOT EXISTS public.branch_business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  service_type text NOT NULL DEFAULT 'all' CHECK (service_type IN ('all','dine_in','pickup','delivery')),
  UNIQUE (branch_id, day_of_week, service_type, opens_at)
);

-- Important application-side transaction rules:
-- * Allocate order numbers and enforce reservation/table overlap atomically.
-- * Recalculate totals and validate modifier-group min/max selections in one transaction.
-- * Update order/payment state only from verified, idempotent payment-provider events.
-- * Check loyalty balance and promo quotas under row locks before redeeming.
-- * Enforce ownership when linking an address/voucher/family member to an order.
-- * Use migrations for changes; do not edit a live production schema manually.
