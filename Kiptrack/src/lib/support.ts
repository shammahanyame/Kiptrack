import { supabase } from '@/lib/supabase';

export type SupportTicket = {
  id: string;
  subject: string;
  body: string;
  channel: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
};

export type TicketMessage = {
  id: string;
  ticketId: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

type TicketRow = {
  id: string;
  subject: string;
  body: string;
  channel: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

function mapTicket(row: TicketRow): SupportTicket {
  return {
    id: row.id,
    subject: row.subject,
    body: row.body,
    channel: row.channel,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): TicketMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    senderId: row.sender_id,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function fetchTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id,subject,body,channel,status,priority,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as TicketRow[]).map(mapTicket);
}

export async function createTicket(input: {
  subject: string;
  body: string;
  channel?: string;
  priority?: string;
}): Promise<SupportTicket> {
  const { data: userData } = await supabase.auth.getUser();
  const profileId = userData.user?.id;
  if (!profileId) throw new Error('Sign in to contact support.');

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      profile_id: profileId,
      subject: input.subject.trim(),
      body: input.body.trim(),
      channel: input.channel ?? 'in_app',
      priority: input.priority ?? 'normal',
    })
    .select('id,subject,body,channel,status,priority,created_at,updated_at')
    .single();
  if (error) throw error;
  return mapTicket(data as TicketRow);
}

export async function fetchTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  const { data, error } = await supabase
    .from('ticket_messages')
    .select('id,ticket_id,sender_id,body,read_at,created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as MessageRow[]).map(mapMessage);
}

export async function addTicketMessage(ticketId: string, body: string): Promise<TicketMessage> {
  const { data: userData } = await supabase.auth.getUser();
  const senderId = userData.user?.id;
  if (!senderId) throw new Error('Sign in to reply.');

  const { data, error } = await supabase
    .from('ticket_messages')
    .insert({ ticket_id: ticketId, sender_id: senderId, body: body.trim() })
    .select('id,ticket_id,sender_id,body,read_at,created_at')
    .single();
  if (error) throw error;
  return mapMessage(data as MessageRow);
}
