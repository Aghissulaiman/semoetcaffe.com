/**
 * Seed data dasar untuk development.
 *
 * Idempotent: aman dijalankan berkali-kali karena memakai `ON CONFLICT DO
 * NOTHING/UPDATE`. Tidak pernah menimpa password user yang sudah ada.
 *
 * Jalankan: npm run db:seed
 */

import { closeDatabase, db } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { buildUpsert } from '../utils/serialize.js';
import { hashPassword } from '../utils/password.js';
import { ACTIONS, RESOURCES } from '../config/constants.js';

// --------------------------------------------------------------------------
// Permission matrix
// --------------------------------------------------------------------------
/** Resource yang memakai semua action CRUD + manage. */
const FULL_CRUD_RESOURCES: Array<{ resource: string; label: string }> = [
  { resource: RESOURCES.AUTH, label: 'Autentikasi dan sesi' },
  { resource: RESOURCES.USER, label: 'Manajemen user' },
  { resource: RESOURCES.BRANCH, label: 'Cabang' },
  { resource: RESOURCES.MENU, label: 'Menu dan katalog' },
  { resource: RESOURCES.ORDER, label: 'Pesanan' },
  { resource: RESOURCES.PAYMENT, label: 'Pembayaran' },
  { resource: RESOURCES.DELIVERY, label: 'Pengiriman' },
  { resource: RESOURCES.PROMO, label: 'Promo dan voucher' },
  { resource: RESOURCES.LOYALTY, label: 'Loyalitas dan poin' },
  { resource: RESOURCES.REVIEW, label: 'Ulasan' },
  { resource: RESOURCES.RESERVATION, label: 'Reservasi' },
  { resource: RESOURCES.EVENT, label: 'Event dan katering' },
  { resource: RESOURCES.INVENTORY, label: 'Inventaris' },
  { resource: RESOURCES.PURCHASE, label: 'Pembelian dan supplier' },
  { resource: RESOURCES.MOMENT, label: 'Moment komunitas' },
  { resource: RESOURCES.CHAT, label: 'Chat customer service' },
  { resource: RESOURCES.GAMIFICATION, label: 'Gamifikasi' },
  { resource: RESOURCES.AI, label: 'Asisten AI' },
  { resource: RESOURCES.AUDIT, label: 'Audit log' },
  { resource: RESOURCES.EXPENSE, label: 'Pengeluaran operasional' },
];

const ALL_ACTIONS = [
  ACTIONS.CREATE,
  ACTIONS.READ,
  ACTIONS.UPDATE,
  ACTIONS.DELETE,
  ACTIONS.MANAGE,
] as const;

interface RoleDefinition {
  code: string;
  name: string;
  description: string;
  /** '*' = semua permission; selain itu daftar `resource:action`. */
  permissions: '*' | string[];
}

const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    code: 'super_admin',
    name: 'Super Admin',
    description: 'Akses penuh ke seluruh fitur, termasuk manajemen role.',
    permissions: '*',
  },
  {
    code: 'admin',
    name: 'Admin',
    description: 'Operasional harian seluruh cabang tanpa akses ke-super-admin.',
    permissions: FULL_CRUD_RESOURCES.filter((item) => item.resource !== RESOURCES.AUTH).flatMap(
      (item) => ALL_ACTIONS.map((action) => `${item.resource}:${action}`),
    ),
  },
  {
    code: 'branch_manager',
    name: 'Branch Manager',
    description: 'Mengelola operasional satu cabang: menu, pesanan, promo, inventaris.',
    permissions: [
      RESOURCES.MENU,
      RESOURCES.ORDER,
      RESOURCES.DELIVERY,
      RESOURCES.PROMO,
      RESOURCES.LOYALTY,
      RESOURCES.RESERVATION,
      RESOURCES.EVENT,
      RESOURCES.INVENTORY,
      RESOURCES.PURCHASE,
    ].flatMap((resource) => [
      `${resource}:${ACTIONS.READ}`,
      `${resource}:${ACTIONS.UPDATE}`,
      `${resource}:${ACTIONS.MANAGE}`,
    ]),
  },
  {
    code: 'staff',
    name: 'Staff',
    description: 'Melayani order, mengantar, dan membalas chat.',
    permissions: [
      `${RESOURCES.ORDER}:${ACTIONS.READ}`,
      `${RESOURCES.ORDER}:${ACTIONS.UPDATE}`,
      `${RESOURCES.DELIVERY}:${ACTIONS.READ}`,
      `${RESOURCES.DELIVERY}:${ACTIONS.UPDATE}`,
      `${RESOURCES.CHAT}:${ACTIONS.READ}`,
      `${RESOURCES.CHAT}:${ACTIONS.UPDATE}`,
      `${RESOURCES.MENU}:${ACTIONS.READ}`,
      // Kasir perlu melihat stok dan mencatat stok fisik (stok opname).
      `${RESOURCES.INVENTORY}:${ACTIONS.READ}`,
      `${RESOURCES.INVENTORY}:${ACTIONS.CREATE}`,
      `${RESOURCES.INVENTORY}:${ACTIONS.UPDATE}`,
    ],
  },
  {
    code: 'customer',
    name: 'Customer',
    description: 'Akun pelanggan aplikasi. Tidak punya permission admin.',
    permissions: [],
  },
];

// --------------------------------------------------------------------------
// Tier loyalitas
// --------------------------------------------------------------------------
const TIERS = [
  {
    code: 'bronze',
    name: 'Bronze',
    minimumLifetimePoints: 0,
    benefits: { pointMultiplier: 1, birthdayBonus: 0, description: 'Tier awal untuk semua pelanggan.' },
  },
  {
    code: 'silver',
    name: 'Silver',
    minimumLifetimePoints: 20_000,
    benefits: { pointMultiplier: 1.1, birthdayBonus: 5_000, description: 'Bonus poin 10% dan hadiah ulang tahun.' },
  },
  {
    code: 'gold',
    name: 'Gold',
    minimumLifetimePoints: 50_000,
    benefits: {
      pointMultiplier: 1.25,
      birthdayBonus: 15_000,
      freeMonthlyVoucher: true,
      description: 'Bonus poin 25%, voucher bulanan, dan prioritas antrean.',
    },
  },
  {
    code: 'platinum',
    name: 'Platinum',
    minimumLifetimePoints: 100_000,
    benefits: {
      pointMultiplier: 1.5,
      birthdayBonus: 30_000,
      freeMonthlyVoucher: true,
      priorityReservation: true,
      description: 'Tier tertinggi: poin 1,5x, harga khusus, dan reservasi prioritas.',
    },
  },
];

// --------------------------------------------------------------------------
// Gamification
// --------------------------------------------------------------------------
const ACTIVITIES = [
  {
    code: 'daily_checkin',
    name: 'Absen Harian',
    activityType: 'daily_checkin',
    rules: { dailyLimit: 1, requiresOrder: false, streakBonus: true },
    rewards: [
      { rewardType: 'points', rewardValue: 50, weight: 60, config: {} },
      { rewardType: 'points', rewardValue: 150, weight: 30, config: {} },
      { rewardType: 'voucher', rewardValue: 1, weight: 10, config: { codePrefix: 'ABSEN' } },
    ],
  },
  {
    code: 'spin_wheel',
    name: 'Putar Roda',
    activityType: 'spin_wheel',
    rules: { dailyLimit: 3 },
    rewards: [
      { rewardType: 'points', rewardValue: 25, weight: 50, config: {} },
      { rewardType: 'points', rewardValue: 100, weight: 30, config: {} },
      { rewardType: 'voucher', rewardValue: 1, weight: 15, config: { codePrefix: 'SPIN' } },
      { rewardType: 'none', rewardValue: 0, weight: 5, config: {} },
    ],
  },
];

// --------------------------------------------------------------------------
// Seed helpers
// --------------------------------------------------------------------------
async function seedPermissions(): Promise<Map<string, string>> {
  const keys = FULL_CRUD_RESOURCES.flatMap((item) =>
    ALL_ACTIONS.map((action) => `${item.resource}:${action}`),
  );

  for (const key of keys) {
    const [resource, action] = key.split(':');
    await db.query(
      `INSERT INTO permissions (resource, action)
       VALUES ($1, $2)
       ON CONFLICT (resource, action) DO NOTHING`,
      [resource, action],
    );
  }

  const rows = await db.queryMany<{ id: string; resource: string; action: string }>(
    `SELECT id, resource, action FROM permissions`,
  );
  const index = new Map<string, string>();
  for (const row of rows) index.set(`${row.resource}:${row.action}`, row.id);

  logger.info({ count: rows.length }, '[seed] permission siap');
  return index;
}

async function seedRoles(permissionIndex: Map<string, string>): Promise<Map<string, string>> {
  const roleIds = new Map<string, string>();

  for (const role of ROLE_DEFINITIONS) {
    await db.query(
      `INSERT INTO roles (code, name, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name,
                                       description = EXCLUDED.description`,
      [role.code, role.name, role.description],
    );

    const row = await db.queryOne<{ id: string }>(`SELECT id FROM roles WHERE code = $1`, [
      role.code,
    ]);
    if (!row) throw new Error(`Gagal membuat role ${role.code}`);
    roleIds.set(role.code, row.id);

    if (role.permissions === '*') continue;

    // Hapus permission lama lalu pasang ulang supaya konsisten dengan definisi.
    await db.query(`DELETE FROM role_permissions WHERE role_id = $1`, [row.id]);
    for (const key of role.permissions) {
      const permissionId = permissionIndex.get(key);
      if (!permissionId) {
        logger.warn({ key, role: role.code }, '[seed] permission tidak dikenal, dilewati');
        continue;
      }
      await db.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [row.id, permissionId],
      );
    }
  }

  // Super admin tetap punya seluruh permission secara eksplisit supaya
  // rbac tidak perlu rely pada kode bypass.
  const superAdminId = roleIds.get('super_admin');
  if (superAdminId) {
    for (const permissionId of permissionIndex.values()) {
      await db.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [superAdminId, permissionId],
      );
    }
  }

  logger.info({ count: roleIds.size }, '[seed] role siap');
  return roleIds;
}

async function seedTiers(): Promise<void> {
  for (const tier of TIERS) {
    await db.query(
      `INSERT INTO customer_tiers (code, name, minimum_lifetime_points, benefits)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name,
                                       minimum_lifetime_points = EXCLUDED.minimum_lifetime_points,
                                       benefits = EXCLUDED.benefits`,
      [tier.code, tier.name, tier.minimumLifetimePoints, JSON.stringify(tier.benefits)],
    );
  }
  logger.info({ count: TIERS.length }, '[seed] tier loyalitas siap');
}

async function seedActivities(): Promise<void> {
  for (const activity of ACTIVITIES) {
    await db.query(
      `INSERT INTO gamification_activities (code, name, activity_type, rules)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name,
                                       activity_type = EXCLUDED.activity_type,
                                       rules = EXCLUDED.rules`,
      [activity.code, activity.name, activity.activityType, JSON.stringify(activity.rules)],
    );

    const row = await db.queryOne<{ id: string }>(
      `SELECT id FROM gamification_activities WHERE code = $1`,
      [activity.code],
    );
    if (!row) continue;

    for (const reward of activity.rewards) {
      await db.query(
        `INSERT INTO gamification_rewards (activity_id, reward_type, reward_value, weight, config)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT DO NOTHING`,
        [row.id, reward.rewardType, reward.rewardValue, reward.weight, JSON.stringify(reward.config)],
      );
    }
  }
  logger.info({ count: ACTIVITIES.length }, '[seed] aktivitas gamifikasi siap');
}

async function seedBranches(): Promise<void> {
  const branches = [
    {
      code: 'SMO-CCBD',
      name: 'Semoet Cafe Dago',
      address: 'Jl. Ir. H. Juanda No. 132, Bandung',
      phone: '+628111000111',
      timezone: 'Asia/Jakarta',
      latitude: -6.8915,
      longitude: 107.6137,
    },
    {
      code: 'SMO-SBY',
      name: 'Semoet Cafe Surabaya',
      address: 'Jl. Mayar Prawira No. 20, Surabaya',
      phone: '+628111000222',
      timezone: 'Asia/Jakarta',
      latitude: -7.2575,
      longitude: 112.7521,
    },
  ];

  for (const branch of branches) {
    const upsert = buildUpsert(
      'branches',
      {
        code: branch.code,
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
        timezone: branch.timezone,
        latitude: branch.latitude,
        longitude: branch.longitude,
        is_active: true,
      },
      ['code'],
      ['name', 'address', 'phone', 'timezone', 'is_active'],
    );
    await db.query(upsert.text, upsert.values);
  }

  logger.info({ count: branches.length }, '[seed] cabang siap');
}

/**
 * Admin bootstrap. Password hanya di-set saat user baru dibuat supaya
 * `db:seed` berulang tidak mereset password yang sudah diganti.
 */
async function seedAdmin(roleIds: Map<string, string>): Promise<void> {
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  const phone = env.SEED_ADMIN_PHONE;

  const existing = await db.queryOne<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 OR phone_e164 = $2 LIMIT 1`,
    [email, phone],
  );

  let userId: string;
  if (existing) {
    userId = existing.id;
    logger.info({ email }, '[seed] admin sudah ada, password tidak diubah');
  } else {
    const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);
    const created = await db.queryOne<{ id: string }>(
      `INSERT INTO users (email, phone_e164, display_name, password_hash, status,
                          email_verified_at, phone_verified_at)
       VALUES ($1, $2, $3, $4, 'active', now(), now())
       RETURNING id`,
      [email, phone, 'Administrator Semoet', passwordHash],
    );
    if (!created) throw new Error('Gagal membuat user admin');
    userId = created.id;
    logger.info({ email }, '[seed] admin dibuat');
  }

  // Profile + tier bronze supaya admin langsung punya profil valid.
  const bronze = await db.queryScalar<{ id: string }>(
    `SELECT id FROM customer_tiers WHERE code = 'bronze' LIMIT 1`,
  );
  await db.query(
    `INSERT INTO customer_profiles (user_id, tier_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, bronze],
  );

  for (const roleCode of ['super_admin', 'admin']) {
    const roleId = roleIds.get(roleCode);
    if (!roleId) continue;
    await db.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, roleId],
    );
  }
}

async function main(): Promise<void> {
  logger.info('[seed] mulai seed data dasar');

  const permissionIndex = await seedPermissions();
  const roleIds = await seedRoles(permissionIndex);
  await seedTiers();
  await seedActivities();
  await seedBranches();
  await seedAdmin(roleIds);

  logger.info('[seed] selesai');
  await closeDatabase();
}

main().catch(async (error: unknown) => {
  logger.error({ err: error }, '[seed] gagal');
  await closeDatabase().catch(() => undefined);
  process.exitCode = 1;
});
