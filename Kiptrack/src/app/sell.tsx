import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { PrimaryButton, SecondaryButton } from '@/components/button';
import { FormField } from '@/components/form-field';
import { Icon } from '@/components/icon';
import { Screen, ScreenHeader } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { useListing } from '@/hooks/use-seller';
import { useTheme } from '@/hooks/use-theme';
import { detectLocale } from '@/lib/format';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/state/auth';

const locale = detectLocale();
const IMAGE_BUCKET = 'product-images';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Sell screen. Without an `id` it publishes a new listing; with `?id=` it loads
 * that listing and saves changes instead. Photos go to the `product-images`
 * bucket, the row goes to `products`. The first photo is the cover.
 */
export default function SellScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = id ?? null;
  const { user, loading: authLoading } = useAuth();
  const { data: catalog, status: catalogStatus, reload: reloadCatalog } = useCatalog(locale);
  const { status: listingStatus, listing, error: listingError } = useListing(editingId ?? undefined);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('1');
  const [categoryId, setCategoryId] = useState('');
  const [visibility, setVisibility] = useState<'active' | 'inactive'>('active');
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const categories = useMemo(() => catalog?.categories ?? [], [catalog]);
  const photoCount = existingImages.length + images.length;

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace({ pathname: '/login', params: { next: 'sell' } });
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (!listing) return;
    setTitle(listing.title);
    setDescription(listing.description);
    setPrice(String(listing.priceMinor));
    setStock(String(listing.stockQty));
    setCategoryId(listing.categoryId);
    setVisibility(listing.status);
    setExistingImages(listing.images.filter(Boolean));
    setImages([]);
  }, [listing]);

  const pickImages = async () => {
    setError('');
    const remaining = MAX_IMAGES - photoCount;
    if (remaining <= 0) {
      setError(`You can add up to ${MAX_IMAGES} photos.`);
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.85,
        base64: true,
      });
      if (!result.canceled) {
        setImages((current) =>
          [...current, ...result.assets].slice(0, MAX_IMAGES - existingImages.length),
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open your photo library.');
    }
  };

  const save = async () => {
    setError('');
    const priceAmount = Number(price.replace(/[\s,]/g, ''));
    const stockAmount = Number(stock);

    if (!isSupabaseConfigured) return setError('Supabase is not configured for this app.');
    if (!user) {
      router.replace({ pathname: '/login', params: { next: 'sell' } });
      return;
    }
    if (!title.trim()) return setError('Add a title for your item.');
    if (!categoryId) return setError('Choose a category.');
    if (!Number.isSafeInteger(priceAmount) || priceAmount < 1) {
      return setError('Enter a whole-number price greater than zero.');
    }
    if (!Number.isSafeInteger(stockAmount) || stockAmount < 0) {
      return setError('Enter how many you have in stock (0 is allowed).');
    }
    if (photoCount === 0) return setError('Add at least one photo of your item.');

    for (const asset of images) {
      // ImagePicker returns JPEG base64 on native; web preserves the selected type.
      const mimeType = Platform.OS === 'web' ? asset.mimeType ?? 'image/jpeg' : 'image/jpeg';
      if (asset.base64 && !IMAGE_TYPES.includes(mimeType)) {
        return setError('Choose JPEG, PNG, or WebP photos.');
      }
      if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
        return setError('Each photo must be smaller than 5 MB.');
      }
    }

    setBusy(true);
    const uploadedPaths: string[] = [];
    try {
      const imageUrls = [...existingImages];

      for (const asset of images) {
        if (!asset.base64) continue;
        const mimeType = Platform.OS === 'web' ? asset.mimeType ?? 'image/jpeg' : 'image/jpeg';
        const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(IMAGE_BUCKET)
          .upload(path, decode(asset.base64), { contentType: mimeType, upsert: false });
        if (uploadError) throw uploadError;

        uploadedPaths.push(path);
        imageUrls.push(supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);
      }

      if (imageUrls.length === 0) throw new Error('Add at least one photo of your item.');

      const row = {
        category_id: categoryId,
        title: title.trim(),
        description: description.trim(),
        selling_price_minor: priceAmount,
        stock_qty: stockAmount,
        images: imageUrls,
        status: stockAmount > 0 ? visibility : 'inactive',
        published_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error: updateError } = await supabase.from('products').update(row).eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('products')
          .insert({ ...row, seller_id: user.id });
        if (insertError) throw insertError;
      }

      reloadCatalog();
      Alert.alert(
        editingId ? 'Listing updated' : 'Published',
        editingId
          ? 'Your changes are live in the catalogue.'
          : 'Your item is now in the catalogue for buyers to find.',
        [{ text: 'OK', style: 'cancel', onPress: () => router.replace('/seller') }],
      );
    } catch (caught) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(IMAGE_BUCKET).remove(uploadedPaths).catch(() => {});
      }
      setError(caught instanceof Error ? caught.message : 'Could not save your listing.');
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || !user) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.accentStrong} />
        </View>
      </Screen>
    );
  }

  if (editingId && listingStatus === 'loading') {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.accentStrong} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.five }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title={editingId ? 'Edit listing' : 'Sell an item'}
          subtitle={
            editingId
              ? 'Update the photos, price and stock buyers see.'
              : 'Add a piece to the Kiptrack marketplace'
          }
        />

        <View style={styles.form}>
          {editingId && listingStatus === 'error' ? (
            <ThemedText variant="footnote" tone="danger">
              {listingError instanceof Error ? listingError.message : 'Could not load this listing.'}
            </ThemedText>
          ) : null}

          <View style={styles.field}>
            <View style={styles.photoHead}>
              <ThemedText variant="callout">Photos</ThemedText>
              <ThemedText variant="footnote" tone="textSecondary">
                {photoCount}/{MAX_IMAGES}
              </ThemedText>
            </View>

            <View style={styles.photoGrid}>
              {existingImages.map((uri, index) => (
                <View key={`${uri}-${index}`} style={styles.photoTile}>
                  <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${index + 1}`}
                    hitSlop={6}
                    onPress={() =>
                      setExistingImages((current) => current.filter((_, position) => position !== index))
                    }
                    style={[styles.photoRemove, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
                    <Icon name="close" size={13} color={theme.text} />
                  </Pressable>
                </View>
              ))}

              {images.map((asset, index) => (
                <View key={`${asset.uri}-${index}`} style={styles.photoTile}>
                  <Image source={{ uri: asset.uri }} style={styles.photo} resizeMode="cover" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove new photo ${index + 1}`}
                    hitSlop={6}
                    onPress={() => setImages((current) => current.filter((_, position) => position !== index))}
                    style={[styles.photoRemove, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
                    <Icon name="close" size={13} color={theme.text} />
                  </Pressable>
                </View>
              ))}

              {photoCount < MAX_IMAGES ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add photos"
                  onPress={pickImages}
                  style={({ pressed }) => [
                    styles.addPhoto,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}>
                  <Icon name="plus" size={20} color={theme.textSecondary} />
                  <ThemedText variant="caption" tone="textSecondary">
                    ADD
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>

            <ThemedText variant="footnote" tone="textSecondary">
              Up to {MAX_IMAGES} photos, JPEG/PNG/WebP, 5 MB each. The first photo is the cover buyers
              see.
            </ThemedText>
          </View>

          <FormField
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="What are you selling?"
            maxLength={120}
            returnKeyType="next"
          />

          <View style={styles.field}>
            <ThemedText variant="callout">Category</ThemedText>
            {catalogStatus === 'loading' ? (
              <ActivityIndicator color={theme.accentStrong} />
            ) : categories.length > 0 ? (
              <View style={styles.categories}>
                {categories.map((category) => {
                  const selected = category.id === categoryId;
                  return (
                    <Pressable
                      key={category.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setCategoryId(category.id)}
                      style={[
                        styles.category,
                        {
                          backgroundColor: selected ? theme.surfaceRaised : theme.surface,
                          borderColor: selected ? theme.accentStrong : theme.border,
                        },
                      ]}>
                      <ThemedText variant="footnote" tone={selected ? 'accentText' : 'textSecondary'}>
                        {category.name}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <ThemedText variant="footnote" tone="danger">
                Categories are unavailable. Refresh the catalogue and try again.
              </ThemedText>
            )}
          </View>

          <FormField
            label="Price (XAF)"
            value={price}
            onChangeText={setPrice}
            placeholder="e.g. 15000"
            keyboardType="number-pad"
          />
          <FormField
            label="Quantity available"
            value={stock}
            onChangeText={setStock}
            placeholder="1"
            keyboardType="number-pad"
            hint="Set to 0 to keep the listing but hide it from buyers."
          />
          <FormField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the condition, size, or details buyers should know."
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />

          <View style={styles.field}>
            <ThemedText variant="callout">Visibility</ThemedText>
            <View style={styles.visibility}>
              <Chip
                label="Live"
                selected={visibility === 'active'}
                onPress={() => setVisibility('active')}
              />
              <Chip
                label="Paused"
                selected={visibility === 'inactive'}
                onPress={() => setVisibility('inactive')}
              />
            </View>
            <ThemedText variant="footnote" tone="textSecondary">
              Paused listings stay in your store but are hidden from buyers.
            </ThemedText>
          </View>

          {error ? (
            <ThemedText variant="footnote" tone="danger" accessibilityRole="alert">
              {error}
            </ThemedText>
          ) : null}

          <PrimaryButton
            label={editingId ? 'Save changes' : 'Publish item'}
            onPress={save}
            busy={busy}
            disabled={catalogStatus !== 'ready' || categories.length === 0}
          />
          <SecondaryButton label="Cancel" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.four },
  form: { gap: Spacing.three, paddingHorizontal: ScreenPadding, paddingTop: Spacing.two },
  field: { gap: Spacing.two },
  photoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  photoTile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: Radius.medium,
    overflow: 'hidden',
    backgroundColor: '#00000010',
  },
  photo: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  category: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  visibility: { flexDirection: 'row', gap: Spacing.two },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
