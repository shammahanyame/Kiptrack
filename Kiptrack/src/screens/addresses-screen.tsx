import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, SecondaryButton } from '@/components/button';
import { FormField } from '@/components/form-field';
import { Icon } from '@/components/icon';
import { Screen, ScreenHeader } from '@/components/screen';
import { EmptyState, LoadingState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  type Address,
  type AddressInput,
  type AddressType,
  createAddress,
  deleteAddress,
  fetchAddresses,
  setDefaultAddress,
  updateAddress,
} from '@/lib/addresses';

const TYPES: { value: AddressType; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'other', label: 'Other' },
];

export default function AddressesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Address | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setAddresses(await fetchAddresses());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load addresses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (address: Address) => {
    setEditing(address);
    setCreating(true);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  const handleDelete = (address: Address) => {
    Alert.alert('Delete address?', address.receiver, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAddress(address.id);
            await load();
          } catch (caught) {
            Alert.alert('Could not delete', caught instanceof Error ? caught.message : 'Try again.');
          }
        },
      },
    ]);
  };

  const handleSetDefault = async (address: Address) => {
    try {
      await setDefaultAddress(address.id);
      await load();
    } catch (caught) {
      Alert.alert('Could not update', caught instanceof Error ? caught.message : 'Try again.');
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Saved addresses"
        subtitle={addresses.length ? `${addresses.length} saved` : 'Where your orders go'}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add address"
            onPress={openCreate}
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
            <Icon name="plus" size={18} color={theme.accentStrong} />
          </Pressable>
        }
      />

      {loading ? (
        <LoadingState label="Loading addresses…" />
      ) : error ? (
        <EmptyState icon="error" title="Addresses unavailable" message={error} />
      ) : addresses.length === 0 ? (
        <EmptyState
          icon="pin"
          title="No saved addresses yet"
          message="Add one to speed up checkout."
          actionLabel="Add address"
          onAction={openCreate}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}>
          {addresses.map((address) => (
            <View
              key={address.id}
              style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <View style={styles.cardHead}>
                <View style={styles.cardTitle}>
                  <ThemedText variant="callout">{address.receiver}</ThemedText>
                  <ThemedText variant="caption" tone="textSecondary">
                    {TYPES.find((t) => t.value === address.type)?.label ?? 'Other'}
                    {address.label ? ` · ${address.label}` : ''}
                  </ThemedText>
                </View>
                {address.isDefault ? (
                  <ThemedText variant="caption" tone="accentText">
                    Default
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText variant="footnote" tone="textSecondary">
                {address.addressLine1}
                {address.addressLine2 ? `, ${address.addressLine2}` : ''}
              </ThemedText>
              <ThemedText variant="footnote" tone="textSecondary">
                {address.city}
                {address.region ? `, ${address.region}` : ''} · {address.phone}
              </ThemedText>
              <View style={styles.actions}>
                <Pressable onPress={() => openEdit(address)} hitSlop={8}>
                  <ThemedText variant="footnote" tone="accentText">
                    Edit
                  </ThemedText>
                </Pressable>
                {!address.isDefault ? (
                  <Pressable onPress={() => handleSetDefault(address)} hitSlop={8}>
                    <ThemedText variant="footnote" tone="textSecondary">
                      Make default
                    </ThemedText>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => handleDelete(address)} hitSlop={8}>
                  <ThemedText variant="footnote" tone="danger">
                    Delete
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <AddressFormModal
        visible={creating}
        address={editing}
        onClose={closeForm}
        onSaved={async () => {
          closeForm();
          await load();
        }}
      />
    </Screen>
  );
}

function AddressFormModal({
  visible,
  address,
  onClose,
  onSaved,
}: {
  visible: boolean;
  address: Address | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [type, setType] = useState<AddressType>(address?.type ?? 'home');
  const [label, setLabel] = useState(address?.label ?? '');
  const [receiver, setReceiver] = useState(address?.receiver ?? '');
  const [phone, setPhone] = useState(address?.phone ?? '');
  const [line1, setLine1] = useState(address?.addressLine1 ?? '');
  const [line2, setLine2] = useState(address?.addressLine2 ?? '');
  const [city, setCity] = useState(address?.city ?? '');
  const [region, setRegion] = useState(address?.region ?? '');
  const [isDefault, setIsDefault] = useState(address?.isDefault ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setType(address?.type ?? 'home');
    setLabel(address?.label ?? '');
    setReceiver(address?.receiver ?? '');
    setPhone(address?.phone ?? '');
    setLine1(address?.addressLine1 ?? '');
    setLine2(address?.addressLine2 ?? '');
    setCity(address?.city ?? '');
    setRegion(address?.region ?? '');
    setIsDefault(address?.isDefault ?? false);
    setError('');
  }, [address, visible]);

  const submit = async () => {
    setError('');
    if (!receiver.trim()) return setError('Enter the receiver name.');
    if (phone.replace(/\D/g, '').length < 8) return setError('Enter a reachable phone number.');
    if (!line1.trim()) return setError('Enter the street address.');
    if (!city.trim()) return setError('Enter the city.');

    const input: AddressInput = {
      type,
      label: label.trim() || null,
      receiver,
      phone,
      addressLine1: line1,
      addressLine2: line2.trim() || null,
      city,
      region: region.trim() || null,
      isDefault,
    };

    setBusy(true);
    try {
      if (address) {
        await updateAddress(address.id, input);
      } else {
        await createAddress(input);
      }
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the address.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView
        contentContainerStyle={[styles.formContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.formHead}>
          <ThemedText variant="title">{address ? 'Edit address' : 'New address'}</ThemedText>
          <Pressable onPress={onClose} hitSlop={8}>
            <Icon name="close" size={20} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.typeRow}>
          {TYPES.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: type === option.value }}
              onPress={() => setType(option.value)}
              style={[
                styles.typeChip,
                {
                  backgroundColor: type === option.value ? theme.primary : theme.surface,
                  borderColor: type === option.value ? theme.primary : theme.border,
                },
              ]}>
              <ThemedText
                variant="footnote"
                tone={type === option.value ? 'onPrimary' : 'textSecondary'}>
                {option.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <FormField label="Label (optional)" value={label} onChangeText={setLabel} placeholder="e.g. Home" />
        <FormField
          label="Receiver"
          value={receiver}
          onChangeText={setReceiver}
          placeholder="Who receives the order?"
          autoCapitalize="words"
        />
        <FormField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. 6 70 00 00 00"
          keyboardType="phone-pad"
        />
        <FormField
          label="Street address"
          value={line1}
          onChangeText={setLine1}
          placeholder="Street, building, apartment"
        />
        <FormField
          label="Address line 2 (optional)"
          value={line2}
          onChangeText={setLine2}
          placeholder="Landmark, floor"
        />
        <FormField label="City" value={city} onChangeText={setCity} placeholder="e.g. Yaoundé" />
        <FormField label="Region (optional)" value={region} onChangeText={setRegion} placeholder="e.g. Centre" />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isDefault }}
          onPress={() => setIsDefault((v) => !v)}
          style={styles.defaultRow}>
          <Icon
            name={isDefault ? 'savedFilled' : 'savedOutline'}
            size={18}
            color={isDefault ? theme.accentStrong : theme.textSecondary}
          />
          <ThemedText variant="footnote" tone="textSecondary">
            Use as default address
          </ThemedText>
        </Pressable>

        {error ? (
          <ThemedText variant="footnote" tone="danger" accessibilityRole="alert">
            {error}
          </ThemedText>
        ) : null}

        <PrimaryButton label={address ? 'Save changes' : 'Add address'} onPress={submit} busy={busy} />
        <SecondaryButton label="Cancel" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { padding: ScreenPadding, gap: Spacing.three },
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardTitle: { gap: Spacing.half, flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  addBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.one },
  pressed: { opacity: 0.6 },
  formContent: { padding: ScreenPadding, gap: Spacing.three },
  formHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typeRow: { flexDirection: 'row', gap: Spacing.two },
  typeChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
});
