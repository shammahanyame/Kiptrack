import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, SecondaryButton } from '@/components/button';
import { FormField } from '@/components/form-field';
import { Screen, ScreenHeader } from '@/components/screen';
import { EmptyState, LoadingState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addTicketMessage, createTicket, fetchTicketMessages, fetchTickets, type SupportTicket } from '@/lib/support';

export default function SupportScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [openTicket, setOpenTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<{ id: string; senderId: string; body: string; createdAt: string }[]>([]);
  const [reply, setReply] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setTickets(await fetchTickets());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load tickets.');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (ticket: SupportTicket) => {
    setOpenTicket(ticket);
    try {
      const list = await fetchTicketMessages(ticket.id);
      setMessages(list.map((m) => ({ id: m.id, senderId: m.senderId, body: m.body, createdAt: m.createdAt })));
    } catch {
      setMessages([]);
    }
  };

  const submitTicket = async () => {
    setFormError('');
    if (!subject.trim()) return setFormError('Add a subject.');
    if (!body.trim()) return setFormError('Describe your issue.');
    setBusy(true);
    try {
      await createTicket({ subject, body });
      setSubject('');
      setBody('');
      setCreating(false);
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not create ticket.');
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!openTicket || !reply.trim()) return;
    try {
      const msg = await addTicketMessage(openTicket.id, reply);
      setMessages((current) => [...current, { id: msg.id, senderId: msg.senderId, body: msg.body, createdAt: msg.createdAt }]);
      setReply('');
    } catch (caught) {
      Alert.alert('Could not send', caught instanceof Error ? caught.message : 'Try again.');
    }
  };

  if (loading) {
    // initial load
  }

  return (
    <Screen>
      <ScreenHeader
        title="Help & support"
        subtitle="We're here to help"
        right={
          <Pressable onPress={() => setCreating(true)} hitSlop={8}>
            <ThemedText variant="footnote" tone="accentText">
              New ticket
            </ThemedText>
          </Pressable>
        }
      />

      {loading ? (
        <LoadingState label="Loading tickets…" />
      ) : error ? (
        <EmptyState icon="error" title="Support unavailable" message={error} />
      ) : tickets.length === 0 ? (
        <EmptyState
          icon="info"
          title="No tickets yet"
          message="Contact support and we'll get back to you."
          actionLabel="New ticket"
          onAction={() => setCreating(true)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}>
          {tickets.map((ticket) => (
            <Pressable
              key={ticket.id}
              onPress={() => loadMessages(ticket)}
              style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <View style={styles.cardHead}>
                <ThemedText variant="callout" numberOfLines={1} style={styles.flex}>
                  {ticket.subject}
                </ThemedText>
                <ThemedText variant="caption" tone="accentText">
                  {ticket.status}
                </ThemedText>
              </View>
              <ThemedText variant="footnote" tone="textSecondary" numberOfLines={2}>
                {ticket.body}
              </ThemedText>
              <ThemedText variant="caption" tone="textTertiary">
                {new Date(ticket.createdAt).toLocaleDateString()}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Create ticket modal */}
      <Modal visible={creating} animationType="slide" onRequestClose={() => setCreating(false)}>
        <ScrollView
          contentContainerStyle={[styles.formContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled">
          <View style={styles.formHead}>
            <ThemedText variant="title">New support ticket</ThemedText>
            <Pressable onPress={() => setCreating(false)} hitSlop={8}>
              <ThemedText variant="footnote" tone="accentText">
                Cancel
              </ThemedText>
            </Pressable>
          </View>
          <FormField label="Subject" value={subject} onChangeText={setSubject} placeholder="What do you need help with?" />
          <FormField
            label="Message"
            value={body}
            onChangeText={setBody}
            placeholder="Describe the issue in detail."
            multiline
            textAlignVertical="top"
          />
          {formError ? (
            <ThemedText variant="footnote" tone="danger" accessibilityRole="alert">
              {formError}
            </ThemedText>
          ) : null}
          <PrimaryButton label="Submit ticket" onPress={submitTicket} busy={busy} />
        </ScrollView>
      </Modal>

      {/* Ticket thread modal */}
      <Modal visible={!!openTicket} animationType="slide" onRequestClose={() => setOpenTicket(null)}>
        <View style={styles.thread}>
          <View style={styles.threadHead}>
            <ThemedText variant="title" numberOfLines={1} style={styles.flex}>
              {openTicket?.subject}
            </ThemedText>
            <Pressable onPress={() => setOpenTicket(null)} hitSlop={8}>
              <ThemedText variant="footnote" tone="accentText">
                Close
              </ThemedText>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.threadMessages}>
            {messages.map((m) => (
              <View key={m.id} style={[styles.bubble, { backgroundColor: theme.surface }]}>
                <ThemedText variant="footnote">{m.body}</ThemedText>
                <ThemedText variant="caption" tone="textTertiary">
                  {new Date(m.createdAt).toLocaleString()}
                </ThemedText>
              </View>
            ))}
          </ScrollView>
          <View style={[styles.replyBar, { paddingBottom: insets.bottom + Spacing.two }]}>
            <FormField label="" value={reply} onChangeText={setReply} placeholder="Write a reply…" />
            <PrimaryButton label="Send" onPress={sendReply} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: ScreenPadding, gap: Spacing.two },
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  formContent: { padding: ScreenPadding, gap: Spacing.three },
  formHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  thread: { flex: 1, padding: ScreenPadding, gap: Spacing.three },
  threadHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  threadMessages: { gap: Spacing.two, paddingVertical: Spacing.two },
  bubble: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  replyBar: { gap: Spacing.two },
});
