-- ---------------------------------------------------------------------------
-- Seed data reservasi (jam buka, area tempat duduk, meja) untuk Semoet Cafe.
--
-- Diperlukan supaya fitur reservasi benar-benar bisa dipakai: tanpa data ini
-- endpoint GET /reservations/availability selalu "tutup" dan POST /reservations
-- selalu gagal dengan "Tidak ada meja yang tersedia".
--
-- Jalankan sekali:
--   psql "$DATABASE_URL" -f src/db/seed-reservation.sql
-- Aman dijalankan ulang: data lama dihapus dulu (idempoten per cabang).
-- ---------------------------------------------------------------------------
BEGIN;

-- --- Bersihkan data reservasi lama (urut sesuai foreign key) -----------------
-- reservation_tables ikut terhapus lewat ON DELETE CASCADE? Tidak — jadi hapus dulu.
DELETE FROM reservation_tables
 WHERE table_id IN (
   SELECT ct.id FROM cafe_tables ct
   JOIN dining_areas da ON da.id = ct.area_id
   JOIN branches b ON b.id = da.branch_id
   WHERE b.code IN ('SMO-CCBD', 'SMO-SBY')
 );
DELETE FROM cafe_tables
 WHERE area_id IN (
   SELECT da.id FROM dining_areas da
   JOIN branches b ON b.id = da.branch_id
   WHERE b.code IN ('SMO-CCBD', 'SMO-SBY')
 );
DELETE FROM dining_areas
 WHERE branch_id IN (SELECT id FROM branches WHERE code IN ('SMO-CCBD', 'SMO-SBY'));
DELETE FROM branch_business_hours
 WHERE branch_id IN (SELECT id FROM branches WHERE code IN ('SMO-CCBD', 'SMO-SBY'));

-- --- Jam buka: Senin–Minggu 09.00–22.00 untuk kedua cabang --------------------
INSERT INTO branch_business_hours (branch_id, day_of_week, opens_at, closes_at, service_type)
SELECT b.id, d.day_of_week, TIME '09:00', TIME '22:00', 'all'
FROM branches b
CROSS JOIN (VALUES (0), (1), (2), (3), (4), (5), (6)) AS d(day_of_week)
WHERE b.code IN ('SMO-CCBD', 'SMO-SBY');

-- --- Area tempat duduk per cabang -------------------------------------------
-- Dago: indoor, outdoor (taman), private room. Surabaya: indoor, outdoor.
INSERT INTO dining_areas (branch_id, name, area_type, is_active)
SELECT b.id, v.name, v.area_type, TRUE
FROM branches b
JOIN (
  VALUES
    ('Indoor',       'indoor'),
    ('Outdoor',      'outdoor'),
    ('Private Room', 'private_room')
) AS v(name, area_type) ON TRUE
WHERE b.code = 'SMO-CCBD'
UNION ALL
SELECT b.id, v.name, v.area_type, TRUE
FROM branches b
JOIN (
  VALUES
    ('Indoor',  'indoor'),
    ('Outdoor', 'outdoor')
) AS v(name, area_type) ON TRUE
WHERE b.code = 'SMO-SBY';

-- --- Meja per area ----------------------------------------------------------
-- Indoor: 8 meja kapasitas 4. Outdoor: 6 meja kapasitas 4.
-- Private Room: 2 meja kapasitas 10.
INSERT INTO cafe_tables (area_id, table_code, capacity, is_active)
SELECT da.id, 'IN-' || LPAD(n::text, 2, '0'), 4, TRUE
FROM dining_areas da
JOIN branches b ON b.id = da.branch_id
CROSS JOIN generate_series(1, 8) AS n
WHERE da.name = 'Indoor' AND b.code IN ('SMO-CCBD', 'SMO-SBY')
UNION ALL
SELECT da.id, 'OUT-' || LPAD(n::text, 2, '0'), 4, TRUE
FROM dining_areas da
JOIN branches b ON b.id = da.branch_id
CROSS JOIN generate_series(1, 6) AS n
WHERE da.name = 'Outdoor' AND b.code IN ('SMO-CCBD', 'SMO-SBY')
UNION ALL
SELECT da.id, 'PR-' || LPAD(n::text, 2, '0'), 10, TRUE
FROM dining_areas da
JOIN branches b ON b.id = da.branch_id
CROSS JOIN generate_series(1, 2) AS n
WHERE da.name = 'Private Room' AND b.code = 'SMO-CCBD';

COMMIT;

-- --- Ringkasan hasil --------------------------------------------------------
SELECT b.code,
       (SELECT COUNT(*) FROM branch_business_hours h WHERE h.branch_id = b.id) AS jam_buka,
       (SELECT COUNT(*) FROM dining_areas da WHERE da.branch_id = b.id) AS area,
       (SELECT COUNT(*) FROM cafe_tables ct
          JOIN dining_areas da ON da.id = ct.area_id
         WHERE da.branch_id = b.id) AS meja
FROM branches b
WHERE b.code IN ('SMO-CCBD', 'SMO-SBY')
ORDER BY b.code;
