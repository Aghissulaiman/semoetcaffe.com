-- ---------------------------------------------------------------------------
-- Seed data DEMO untuk pengembangan app pelanggan (Semoet Cafe).
-- Isi: 4 kategori, 12 produk + varian + gambar, modifier, banner, placement,
-- 2 promo/voucher, 3 hadiah loyalitas. Tidak menyentuh data transaksi.
--
-- Jalankan sekali:
--   psql "$DATABASE_URL" -f src/db/seed-demo.sql
-- Aman dijalankan ulang (data demo dihapus dulu berdasarkan slug/code idempoten).
-- Catatan: bila sudah ada order yang memakai produk demo, DELETE akan gagal
-- karena foreign key order_items — hapus ordernya dulu atau jalankan sebelum ada order.
-- ---------------------------------------------------------------------------
BEGIN;

-- --- Bersihkan data demo lama (urut sesuai foreign key) ---------------------
DELETE FROM product_modifier_groups
 WHERE product_id IN (SELECT id FROM products WHERE slug IN (
  'kopi-susu-semoet','es-kopi-susu-aren','americano','cappuccino','cafe-latte',
  'matcha-latte','cokelat-hangat','nasi-goreng-semoet','mie-goreng-jawa',
  'pisang-goreng-keju','kentang-goreng','brownies-fudge'));
DELETE FROM modifier_options  WHERE group_id IN ('4a000001-0000-4000-8000-000000000001','4a000002-0000-4000-8000-000000000002');
DELETE FROM modifier_groups   WHERE id        IN ('4a000001-0000-4000-8000-000000000001','4a000002-0000-4000-8000-000000000002');
DELETE FROM product_images    WHERE product_id IN (SELECT id FROM products WHERE slug LIKE 'kopi%' OR slug IN (
  'es-kopi-susu-aren','americano','cappuccino','cafe-latte','matcha-latte','cokelat-hangat',
  'nasi-goreng-semoet','mie-goreng-jawa','pisang-goreng-keju','kentang-goreng','brownies-fudge'));
DELETE FROM product_variants  WHERE product_id IN (SELECT id FROM products WHERE slug IN (
  'kopi-susu-semoet','es-kopi-susu-aren','americano','cappuccino','cafe-latte',
  'matcha-latte','cokelat-hangat','nasi-goreng-semoet','mie-goreng-jawa',
  'pisang-goreng-keju','kentang-goreng','brownies-fudge'));
DELETE FROM featured_products WHERE product_id IN (SELECT id FROM products WHERE slug IN (
  'kopi-susu-semoet','es-kopi-susu-aren','americano','cappuccino','cafe-latte',
  'matcha-latte','cokelat-hangat','nasi-goreng-semoet','mie-goreng-jawa',
  'pisang-goreng-keju','kentang-goreng','brownies-fudge'));
DELETE FROM products          WHERE slug IN (
  'kopi-susu-semoet','es-kopi-susu-aren','americano','cappuccino','cafe-latte',
  'matcha-latte','cokelat-hangat','nasi-goreng-semoet','mie-goreng-jawa',
  'pisang-goreng-keju','kentang-goreng','brownies-fudge');
DELETE FROM product_categories WHERE slug IN ('kopi','non-kopi','makanan','camilan');
DELETE FROM home_banners      WHERE id IN ('6a000001-0000-4000-8000-000000000001','6a000002-0000-4000-8000-000000000002');
DELETE FROM promo_campaigns   WHERE code IN ('HEMAT10','POTONG5K');
DELETE FROM loyalty_rewards   WHERE code IN ('GRATIS-KOPI','DISKON-5K','VOUCHER-10K');

-- --- Kategori ---------------------------------------------------------------
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, is_active) VALUES
  ('ca000001-0000-4000-8000-000000000001', NULL, 'Kopi',      'kopi',      1, true),
  ('ca000002-0000-4000-8000-000000000002', NULL, 'Non-Kopi',  'non-kopi',  2, true),
  ('ca000003-0000-4000-8000-000000000003', NULL, 'Makanan',   'makanan',   3, true),
  ('ca000004-0000-4000-8000-000000000004', NULL, 'Camilan',   'camilan',   4, true);

-- --- Produk (created_at bertingkat supaya sortir "Terbaru" punya urutan) ----
INSERT INTO products (id, category_id, name, slug, description, product_kind, is_active, is_featured, sort_order, created_at) VALUES
  ('bd000001-0000-4000-8000-000000000001', 'ca000001-0000-4000-8000-000000000001', 'Kopi Susu Semoet',    'kopi-susu-semoet',    'Espresso, susu segar, dan gula aren khas Semoet. Signature yang paling dicari.', 'coffee', true, true,  1, now() - interval '12 days'),
  ('bd000002-0000-4000-8000-000000000002', 'ca000001-0000-4000-8000-000000000001', 'Es Kopi Susu Aren',   'es-kopi-susu-aren',   'Versi dingin dengan aren cair dan es batu penuh.',                  'coffee', true, true,  2, now() - interval '11 days'),
  ('bd000003-0000-4000-8000-000000000003', 'ca000001-0000-4000-8000-000000000001', 'Americano',           'americano',           'Espresso double dengan air panas, polos dan pekat.',                 'coffee', true, false, 3, now() - interval '10 days'),
  ('bd000004-0000-4000-8000-000000000004', 'ca000001-0000-4000-8000-000000000001', 'Cappuccino',          'cappuccino',          'Espresso dengan foam susu tebal dan taburan kakao.',                'coffee', true, false, 4, now() - interval '9 days'),
  ('bd000005-0000-4000-8000-000000000005', 'ca000001-0000-4000-8000-000000000001', 'Cafe Latte',          'cafe-latte',          'Espresso dan susu steamed dengan foam tipis.',                      'coffee', true, false, 5, now() - interval '8 days'),
  ('bd000006-0000-4000-8000-000000000006', 'ca000002-0000-4000-8000-000000000002', 'Matcha Latte',        'matcha-latte',        'Matcha premium Uji dengan susu segar, panas atau dingin.',          'drink',  true, true,  1, now() - interval '7 days'),
  ('bd000007-0000-4000-8000-000000000007', 'ca000002-0000-4000-8000-000000000002', 'Cokelat Hangat',      'cokelat-hangat',      'Cokelat Belgium leleh dengan susu panas dan foam lembut.',          'drink',  true, false, 2, now() - interval '6 days'),
  ('bd000008-0000-4000-8000-000000000008', 'ca000003-0000-4000-8000-000000000003', 'Nasi Goreng Semoet',  'nasi-goreng-semoet',  'Nasi goreng kampung dengan telur mata sapi dan kerupuk.',            'food',   true, true,  1, now() - interval '5 days'),
  ('bd000009-0000-4000-8000-000000000009', 'ca000003-0000-4000-8000-000000000003', 'Mie Goreng Jawa',     'mie-goreng-jawa',     'Mie goreng Jawa dengan sawi, telur, dan bawang goreng.',             'food',   true, false, 2, now() - interval '4 days'),
  ('bd00000a-0000-4000-8000-00000000000a', 'ca000004-0000-4000-8000-000000000004', 'Pisang Goreng Keju',  'pisang-goreng-keju',  'Pisang goreng kriuk dengan keju parut dan madu.',                    'snack',  true, false, 1, now() - interval '3 days'),
  ('bd00000b-0000-4000-8000-00000000000b', 'ca000004-0000-4000-8000-000000000004', 'Kentang Goreng',      'kentang-goreng',      'French fries renyah dengan saus cabai.',                             'snack',  true, false, 2, now() - interval '2 days'),
  ('bd00000c-0000-4000-8000-00000000000c', 'ca000004-0000-4000-8000-000000000004', 'Brownies Fudge',      'brownies-fudge',      'Brownies fudge lembut dengan topping almond.',                       'dessert', true, false, 3, now() - interval '1 day');

-- --- Varian (harga; wajib minimal satu, satu is_default per produk) --------
INSERT INTO product_variants (id, product_id, sku, name, price_idr, sort_order, is_default, is_active) VALUES
  ('1e000001-0000-4000-8000-000000000001', 'bd000001-0000-4000-8000-000000000001', 'KSS-R', 'Regular', 18000, 0, true,  true),
  ('1e000002-0000-4000-8000-000000000002', 'bd000001-0000-4000-8000-000000000001', 'KSS-L', 'Large',   21000, 1, false, true),
  ('1e000003-0000-4000-8000-000000000003', 'bd000002-0000-4000-8000-000000000002', 'ESA-R', 'Regular', 20000, 0, true,  true),
  ('1e000004-0000-4000-8000-000000000004', 'bd000002-0000-4000-8000-000000000002', 'ESA-L', 'Large',   23000, 1, false, true),
  ('1e000005-0000-4000-8000-000000000005', 'bd000003-0000-4000-8000-000000000003', 'AMR-R', 'Regular', 15000, 0, true,  true),
  ('1e000006-0000-4000-8000-000000000006', 'bd000003-0000-4000-8000-000000000003', 'AMR-L', 'Large',   18000, 1, false, true),
  ('1e000007-0000-4000-8000-000000000007', 'bd000004-0000-4000-8000-000000000004', 'CAP-R', 'Regular', 22000, 0, true,  true),
  ('1e000008-0000-4000-8000-000000000008', 'bd000004-0000-4000-8000-000000000004', 'CAP-L', 'Large',   25000, 1, false, true),
  ('1e000009-0000-4000-8000-000000000009', 'bd000005-0000-4000-8000-000000000005', 'LAT-R', 'Regular', 22000, 0, true,  true),
  ('1e00000a-0000-4000-8000-00000000000a', 'bd000005-0000-4000-8000-000000000005', 'LAT-L', 'Large',   25000, 1, false, true),
  ('1e00000b-0000-4000-8000-00000000000b', 'bd000006-0000-4000-8000-000000000006', 'MTA-R', 'Regular', 24000, 0, true,  true),
  ('1e00000c-0000-4000-8000-00000000000c', 'bd000006-0000-4000-8000-000000000006', 'MTA-L', 'Large',   27000, 1, false, true),
  ('1e00000d-0000-4000-8000-00000000000d', 'bd000007-0000-4000-8000-000000000007', 'CHO-R', 'Regular', 18000, 0, true,  true),
  ('1e00000e-0000-4000-8000-00000000000e', 'bd000007-0000-4000-8000-000000000007', 'CHO-L', 'Large',   21000, 1, false, true),
  ('1e00000f-0000-4000-8000-00000000000f', 'bd000008-0000-4000-8000-000000000008', 'NGS-R', 'Porsi Reguler', 25000, 0, true,  true),
  ('1e000010-0000-4000-8000-000000000010', 'bd000008-0000-4000-8000-000000000008', 'NGS-L', 'Porsi Besar',   30000, 1, false, true),
  ('1e000011-0000-4000-8000-000000000011', 'bd000009-0000-4000-8000-000000000009', 'MGJ-R', 'Porsi Reguler', 22000, 0, true,  true),
  ('1e000012-0000-4000-8000-000000000012', 'bd000009-0000-4000-8000-000000000009', 'MGJ-L', 'Porsi Besar',   27000, 1, false, true),
  ('1e000013-0000-4000-8000-000000000013', 'bd00000a-0000-4000-8000-00000000000a', 'PGK-R', 'Regular', 15000, 0, true,  true),
  ('1e000014-0000-4000-8000-000000000014', 'bd00000b-0000-4000-8000-00000000000b', 'KGR-R', 'Regular', 14000, 0, true,  true),
  ('1e000015-0000-4000-8000-000000000015', 'bd00000b-0000-4000-8000-00000000000b', 'KGR-L', 'Large',   18000, 1, false, true),
  ('1e000016-0000-4000-8000-000000000016', 'bd00000c-0000-4000-8000-00000000000c', 'BRW-R', 'Regular', 16000, 0, true,  true);

-- --- Gambar produk (URL publik; sudah diverifikasi 200) ---------------------
INSERT INTO product_images (id, product_id, storage_key, public_url, alt_text, sort_order, is_primary, width_px, height_px) VALUES
  ('ab000001-0000-4000-8000-000000000001', 'bd000001-0000-4000-8000-000000000001', 'demo/kopi-susu-semoet',     'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80', 'Kopi Susu Semoet',    0, true,  800, 600),
  ('ab000002-0000-4000-8000-000000000002', 'bd000002-0000-4000-8000-000000000002', 'demo/es-kopi-susu-aren',    'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=800&q=80', 'Es Kopi Susu Aren',   0, true,  800, 600),
  ('ab000003-0000-4000-8000-000000000003', 'bd000003-0000-4000-8000-000000000003', 'demo/americano',            'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=800&q=80', 'Americano',           0, true,  800, 600),
  ('ab000004-0000-4000-8000-000000000004', 'bd000004-0000-4000-8000-000000000004', 'demo/cappuccino',           'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80', 'Cappuccino',          0, true,  800, 600),
  ('ab000005-0000-4000-8000-000000000005', 'bd000005-0000-4000-8000-000000000005', 'demo/cafe-latte',           'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=800&q=80', 'Cafe Latte',          0, true,  800, 600),
  ('ab000006-0000-4000-8000-000000000006', 'bd000006-0000-4000-8000-000000000006', 'demo/matcha-latte',         'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=800&q=80',  'Matcha Latte',        0, true,  800, 600),
  ('ab000007-0000-4000-8000-000000000007', 'bd000007-0000-4000-8000-000000000007', 'demo/cokelat-hangat',       'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=800&q=80', 'Cokelat Hangat',      0, true,  800, 600),
  ('ab000008-0000-4000-8000-000000000008', 'bd000008-0000-4000-8000-000000000008', 'demo/nasi-goreng-semoet',   'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80', 'Nasi Goreng Semoet',  0, true,  800, 600),
  ('ab000009-0000-4000-8000-000000000009', 'bd000009-0000-4000-8000-000000000009', 'demo/mie-goreng-jawa',      'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=800&q=80', 'Mie Goreng Jawa',     0, true,  800, 600),
  ('ab00000a-0000-4000-8000-00000000000a', 'bd00000a-0000-4000-8000-00000000000a', 'demo/pisang-goreng-keju',   'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800&q=80', 'Pisang Goreng Keju',  0, true,  800, 600),
  ('ab00000b-0000-4000-8000-00000000000b', 'bd00000b-0000-4000-8000-00000000000b', 'demo/kentang-goreng',       'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800&q=80',  'Kentang Goreng',      0, true,  800, 600),
  ('ab00000c-0000-4000-8000-00000000000c', 'bd00000c-0000-4000-8000-00000000000c', 'demo/brownies-fudge',       'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=800&q=80', 'Brownies Fudge',      0, true,  800, 600);

-- --- Modifier group ---------------------------------------------------------
INSERT INTO modifier_groups (id, name, min_select, max_select, is_required, is_active) VALUES
  ('4a000001-0000-4000-8000-000000000001', 'Pilihan Gula', 0, 1, false, true),
  ('4a000002-0000-4000-8000-000000000002', 'Tambahan',     0, 3, false, true);

INSERT INTO modifier_options (id, group_id, name, price_delta_idr, sort_order, is_active) VALUES
  ('4b000001-0000-4000-8000-000000000001', '4a000001-0000-4000-8000-000000000001', 'Normal',      0,     0, true),
  ('4b000002-0000-4000-8000-000000000002', '4a000001-0000-4000-8000-000000000001', 'Less Sugar',  0,     1, true),
  ('4b000003-0000-4000-8000-000000000003', '4a000001-0000-4000-8000-000000000001', 'No Sugar',    0,     2, true),
  ('4b000004-0000-4000-8000-000000000004', '4a000002-0000-4000-8000-000000000002', 'Extra Shot',  5000,  0, true),
  ('4b000005-0000-4000-8000-000000000005', '4a000002-0000-4000-8000-000000000002', 'Susu Ekstra', 4000,  1, true),
  ('4b000006-0000-4000-8000-000000000006', '4a000002-0000-4000-8000-000000000002', 'Krim Kelapa', 3000,  2, true);

-- Semua minuman: Pilihan Gula; kopi saja: Tambahan
INSERT INTO product_modifier_groups (product_id, group_id, sort_order) VALUES
  ('bd000001-0000-4000-8000-000000000001', '4a000001-0000-4000-8000-000000000001', 1),
  ('bd000001-0000-4000-8000-000000000001', '4a000002-0000-4000-8000-000000000002', 2),
  ('bd000002-0000-4000-8000-000000000002', '4a000001-0000-4000-8000-000000000001', 1),
  ('bd000002-0000-4000-8000-000000000002', '4a000002-0000-4000-8000-000000000002', 2),
  ('bd000003-0000-4000-8000-000000000003', '4a000001-0000-4000-8000-000000000001', 1),
  ('bd000003-0000-4000-8000-000000000003', '4a000002-0000-4000-8000-000000000002', 2),
  ('bd000004-0000-4000-8000-000000000004', '4a000001-0000-4000-8000-000000000001', 1),
  ('bd000004-0000-4000-8000-000000000004', '4a000002-0000-4000-8000-000000000002', 2),
  ('bd000005-0000-4000-8000-000000000005', '4a000001-0000-4000-8000-000000000001', 1),
  ('bd000005-0000-4000-8000-000000000005', '4a000002-0000-4000-8000-000000000002', 2),
  ('bd000006-0000-4000-8000-000000000006', '4a000001-0000-4000-8000-000000000001', 1),
  ('bd000007-0000-4000-8000-000000000007', '4a000001-0000-4000-8000-000000000001', 1);

-- --- Banner beranda ---------------------------------------------------------
INSERT INTO home_banners (id, title, image_storage_key, image_url, target_url, sort_order, is_active) VALUES
  ('6a000001-0000-4000-8000-000000000001', 'Ngopi Yuk di Semoet', 'demo/banner-ngopi-1', 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&q=80', NULL, 1, true),
  ('6a000002-0000-4000-8000-000000000002', 'Promo Diskon 10%',   'demo/banner-promo-2', 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=1200&q=80', 'https://semoetcafe.example.com/promo', 2, true);

-- --- Placement unggulan -----------------------------------------------------
INSERT INTO featured_products (product_id, placement, sort_order) VALUES
  ('bd000001-0000-4000-8000-000000000001', 'favorite', 1),
  ('bd000008-0000-4000-8000-000000000008', 'favorite', 2),
  ('bd000006-0000-4000-8000-000000000006', 'favorite', 3),
  ('bd000002-0000-4000-8000-000000000002', 'favorite', 4),
  ('bd000004-0000-4000-8000-000000000004', 'favorite', 5),
  ('bd00000c-0000-4000-8000-00000000000c', 'favorite', 6),
  ('bd00000c-0000-4000-8000-00000000000c', 'new', 1),
  ('bd00000b-0000-4000-8000-00000000000b', 'new', 2),
  ('bd00000a-0000-4000-8000-00000000000a', 'new', 3),
  ('bd000009-0000-4000-8000-000000000009', 'new', 4),
  ('bd000008-0000-4000-8000-000000000008', 'new', 5),
  ('bd000007-0000-4000-8000-000000000007', 'new', 6);

-- --- Promo / voucher --------------------------------------------------------
INSERT INTO promo_campaigns (id, code, name, description, discount_type, discount_value, minimum_order_idr, maximum_discount_idr, starts_at, ends_at, per_user_quota, is_active) VALUES
  ('7a000001-0000-4000-8000-000000000001', 'HEMAT10',  'Diskon 10%',        'Diskon 10% untuk belanja minimal Rp20.000.',           'percentage', 10.00,   20000, 15000, now() - interval '7 days', now() + interval '90 days', 5, true),
  ('7a000002-0000-4000-8000-000000000002', 'POTONG5K', 'Potongan Rp5.000',  'Potongan Rp5.000 untuk belanja minimal Rp30.000.',     'fixed',      5000.00, 30000, NULL,  now() - interval '7 days', now() + interval '90 days', 5, true);

-- --- Hadiah loyalitas -------------------------------------------------------
INSERT INTO loyalty_rewards (id, code, name, description, points_cost, reward_type, reward_config, is_active) VALUES
  ('9a000001-0000-4000-8000-000000000001', 'GRATIS-KOPI',  'Gratis Kopi Susu Semoet', 'Tukar poin dengan 1 cup Kopi Susu Semoet (Regular).', 100, 'free_product', '{"productSlug": "kopi-susu-semoet"}', true),
  ('9a000002-0000-4000-8000-000000000002', 'DISKON-5K',    'Diskon Rp5.000',         'Potongan Rp5.000 untuk pesanan berikutnya.',           50,  'discount',     '{"discountIdr": 5000}',             true),
  ('9a000003-0000-4000-8000-000000000003', 'VOUCHER-10K',  'Voucher Rp10.000',       'Voucher diskon Rp10.000.',                             80,  'voucher',      '{"discountIdr": 10000}',            true);

COMMIT;
