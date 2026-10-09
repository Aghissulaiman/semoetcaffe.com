import { withTransaction } from '../config/database.js';
import { conflict, notFound, unprocessable } from '../errors/AppError.js';
import * as addressRepo from '../repositories/address.repository.js';
import * as orderRepo from '../repositories/order.repository.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import type {
  CreateAddressInput,
  ListAddressQuery,
  UpdateAddressInput,
} from '../validators/user.validator.js';

const MAX_ADDRESSES_PER_USER = 20;

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

function shapeAddress(row: Record<string, unknown>) {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipientName ?? row.recipient_name,
    recipientPhone: row.recipientPhone ?? row.recipient_phone,
    addressLine: row.addressLine ?? row.address_line,
    addressDetail: row.addressDetail ?? row.address_detail,
    city: row.city,
    province: row.province,
    postalCode: row.postalCode ?? row.postal_code,
    latitude: row.latitude,
    longitude: row.longitude,
    deliveryInstructions: row.deliveryInstructions ?? row.delivery_instructions,
    isDefault: Boolean(row.isDefault ?? row.is_default),
    createdAt: row.createdAt ?? row.created_at,
  };
}

export async function listAddresses(
  userId: string,
  query: ListAddressQuery,
): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  let isDefault: boolean | undefined;
  if (query.isDefault === 'true') isDefault = true;
  if (query.isDefault === 'false') isDefault = false;

  const rows = await addressRepo.listAddresses(userId, paging, isDefault);
  const total = await addressRepo.countAddresses(userId);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return {
    items: (rows as any[]).map((row: any) => shapeAddress(row as any)),
    meta: buildPaginationMeta(pagination),
  };
}

export async function createAddress(userId: string, input: CreateAddressInput) {
  const total = await addressRepo.countAddresses(userId);
  if (total >= MAX_ADDRESSES_PER_USER) {
    throw unprocessable(`Maksimal ${MAX_ADDRESSES_PER_USER} alamat yang dapat disimpan`);
  }

  return withTransaction(async (tx) => {
    if (input.isDefault) {
      await addressRepo.unsetDefaultAddresses(userId, tx);
    }

    const created = await addressRepo.insertAddress(
      {
        userId,
        label: input.label.trim(),
        recipientName: input.recipientName.trim(),
        recipientPhone: input.recipientPhone.trim(),
        addressLine: input.addressLine.trim(),
        addressDetail: input.addressDetail ?? null,
        city: input.city.trim(),
        province: input.province ?? null,
        postalCode: input.postalCode ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        deliveryInstructions: input.deliveryInstructions ?? null,
        isDefault: input.isDefault ?? false,
      },
      tx,
    );

    const address = await addressRepo.findAddressById(created.id, tx);
    return (address as any) ? shapeAddress(address as any) : { id: created.id };
  });
}

export async function getAddress(userId: string, addressId: string) {
  const address = await addressRepo.findAddress(addressId, userId);
  if (!address) throw notFound('Alamat', addressId);
  return shapeAddress(address as any);
}

export async function updateAddress(
  userId: string,
  addressId: string,
  input: UpdateAddressInput,
) {
  const existing = await addressRepo.findAddress(addressId, userId);
  if (!existing) throw notFound('Alamat', addressId);

  const updates: Record<string, unknown> = {};
  if (input.label !== undefined) updates.label = input.label.trim();
  if (input.recipientName !== undefined) updates.recipient_name = input.recipientName.trim();
  if (input.recipientPhone !== undefined) updates.recipient_phone = input.recipientPhone.trim();
  if (input.addressLine !== undefined) updates.address_line = input.addressLine.trim();
  if (input.addressDetail !== undefined) updates.address_detail = input.addressDetail;
  if (input.city !== undefined) updates.city = input.city.trim();
  if (input.province !== undefined) updates.province = input.province;
  if (input.postalCode !== undefined) updates.postal_code = input.postalCode;
  if (input.latitude !== undefined) updates.latitude = input.latitude;
  if (input.longitude !== undefined) updates.longitude = input.longitude;
  if (input.deliveryInstructions !== undefined) updates.delivery_instructions = input.deliveryInstructions;
  if (input.isDefault !== undefined) updates.is_default = input.isDefault;

  return withTransaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await addressRepo.updateAddress(addressId, userId, updates, tx);
    }

    if (input.isDefault === true) {
      await addressRepo.unsetDefaultAddresses(userId, tx);
      await addressRepo.setDefaultAddress(addressId, userId, tx);
    }

    const address = await addressRepo.findAddressById(addressId, tx);
    return address ? shapeAddress(address as unknown as Record<string, unknown>) : await getAddress(userId, addressId);
  });
}

export async function deleteAddress(userId: string, addressId: string) {
  const existing = await addressRepo.findAddress(addressId, userId);
  if (!existing) throw notFound('Alamat', addressId);

  if ((existing as any).is_default || (existing as any).isDefault) {
    throw unprocessable('Tidak dapat menghapus alamat utama. Pilih alamat utama baru terlebih dahulu');
  }

  const activeOrders = await orderRepo.listOrdersForUser(
    userId,
    {
      orderStatus: 'placed',
      sort: 'newest',
      paymentStatus: undefined,
      branchId: undefined,
      from: undefined,
      to: undefined,
    } as orderRepo.ListOrderFilters,
    { page: 1, limit: 100, offset: 0 } as any,
  );

  const hasActiveDelivery = activeOrders.some((order: Record<string, unknown>) => {
    const fulfillment = (order.fulfillmentType ?? order.fulfillment_type) as string;
    const status = (order.orderStatus ?? order.order_status) as string;
    const cancellable = status === 'placed' || status === 'accepted' || status === 'preparing';
    return fulfillment === 'delivery' && cancellable;
  });

  if (hasActiveDelivery) {
    throw conflict('Alamat tidak dapat dihapus karena masih digunakan oleh pesanan aktif');
  }

  await addressRepo.deleteAddress(addressId, userId);
  return { deleted: true };
}

export async function setDefaultAddress(userId: string, addressId: string) {
  const existing = await addressRepo.findAddress(addressId, userId);
  if (!existing) throw notFound('Alamat', addressId);

  return withTransaction(async (tx) => {
    await addressRepo.unsetDefaultAddresses(userId, tx);
    await addressRepo.setDefaultAddress(addressId, userId, tx);
    const addr = await addressRepo.findAddressById(addressId, tx);
    if (addr) return shapeAddress(addr as any);
  });
  return getAddress(userId, addressId);
}