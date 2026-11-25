import { supabase } from '@/lib/supabase';

export type AddressType = 'home' | 'work' | 'other';

export type Address = {
  id: string;
  type: AddressType;
  label: string | null;
  receiver: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string | null;
  country: string;
  postalCode: string | null;
  isDefault: boolean;
};

type AddressRow = {
  id: string;
  type: string;
  label: string | null;
  receiver: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  region: string | null;
  country: string;
  postal_code: string | null;
  is_default: boolean;
};

function mapAddress(row: AddressRow): Address {
  return {
    id: row.id,
    type: (row.type as AddressType) ?? 'other',
    label: row.label,
    receiver: row.receiver,
    phone: row.phone,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    region: row.region,
    country: row.country,
    postalCode: row.postal_code,
    isDefault: row.is_default,
  };
}

const ADDRESS_COLUMNS =
  'id,type,label,receiver,phone,address_line1,address_line2,city,region,country,postal_code,is_default';

export async function fetchAddresses(): Promise<Address[]> {
  const { data, error } = await supabase
    .from('addresses')
    .select(ADDRESS_COLUMNS)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as AddressRow[]).map(mapAddress);
}

export type AddressInput = {
  type: AddressType;
  label?: string | null;
  receiver: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  region?: string | null;
  country?: string;
  postalCode?: string | null;
  isDefault?: boolean;
};

export async function createAddress(input: AddressInput): Promise<Address> {
  const { data: userData } = await supabase.auth.getUser();
  const profileId = userData.user?.id;
  if (!profileId) throw new Error('Sign in to manage addresses.');

  const { data, error } = await supabase
    .from('addresses')
    .insert({
      profile_id: profileId,
      type: input.type,
      label: input.label ?? null,
      receiver: input.receiver.trim(),
      phone: input.phone.trim(),
      address_line1: input.addressLine1.trim(),
      address_line2: input.addressLine2?.trim() || null,
      city: input.city.trim(),
      region: input.region?.trim() || null,
      country: input.country ?? 'CM',
      postal_code: input.postalCode?.trim() || null,
      is_default: input.isDefault ?? false,
    })
    .select(ADDRESS_COLUMNS)
    .single();
  if (error) throw error;
  return mapAddress(data as AddressRow);
}

export async function updateAddress(id: string, input: AddressInput): Promise<Address> {
  const { data, error } = await supabase
    .from('addresses')
    .update({
      type: input.type,
      label: input.label ?? null,
      receiver: input.receiver.trim(),
      phone: input.phone.trim(),
      address_line1: input.addressLine1.trim(),
      address_line2: input.addressLine2?.trim() || null,
      city: input.city.trim(),
      region: input.region?.trim() || null,
      country: input.country ?? 'CM',
      postal_code: input.postalCode?.trim() || null,
      is_default: input.isDefault ?? false,
    })
    .eq('id', id)
    .select(ADDRESS_COLUMNS)
    .single();
  if (error) throw error;
  return mapAddress(data as AddressRow);
}

export async function deleteAddress(id: string): Promise<void> {
  const { error } = await supabase.from('addresses').delete().eq('id', id);
  if (error) throw error;
}

export async function setDefaultAddress(id: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const profileId = userData.user?.id;
  if (!profileId) throw new Error('Sign in to manage addresses.');
  // Clear existing defaults then set the new one.
  await supabase.from('addresses').update({ is_default: false }).eq('profile_id', profileId);
  const { error } = await supabase.from('addresses').update({ is_default: true }).eq('id', id);
  if (error) throw error;
}
