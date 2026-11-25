import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen, ScreenHeader } from '@/components/screen';
import { EmptyState, LoadingState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '@/lib/notifications';

export default function NotificationsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchNotifications());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRead = async (item: AppNotification) => {
    if (item.readAt) return;
    try {
      await markNotificationRead(item.id);
      setItems((current) =>
        current.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
    } catch {
      // best effort
    }
  };

  const handleReadAll = async () => {
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    } catch {
      // best effort
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Notifications"
        subtitle={items.filter((n) => !n.readAt).length ? 'Unread' : 'All caught up'}
        right={
          items.some((n) => !n.readAt) ? (
            <Pressable onPress={handleReadAll} hitSlop={8}>
              <ThemedText variant="footnote" tone="accentText">
                Mark all read
              </ThemedText>
            </Pressable>
          ) : null
        }
      />

      {loading ? (
        <LoadingState label="Loading notifications…" />
      ) : error ? (
        <EmptyState icon="error" title="Notifications unavailable" message={error} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="info"
          title="No notifications yet"
          message="Order updates and alerts will appear here."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleRead(item)}
              style={[
                styles.row,
                {
                  borderColor: theme.border,
                  backgroundColor: item.readAt ? theme.surface : theme.surfaceRaised,
                },
              ]}>
              <View style={styles.rowBody}>
                <ThemedText variant="callout">{item.title}</ThemedText>
                {item.body ? (
                  <ThemedText variant="footnote" tone="textSecondary">
                    {item.body}
                  </ThemedText>
                ) : null}
                <ThemedText variant="caption" tone="textTertiary">
                  {new Date(item.createdAt).toLocaleString()}
                </ThemedText>
              </View>
              {!item.readAt ? <View style={[styles.dot, { backgroundColor: theme.accentStrong }]} /> : null}
            </Pressable>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: ScreenPadding, gap: Spacing.two },
  row: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  rowBody: { flex: 1, gap: Spacing.half },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
