export type SetupData = {
 customer_id: string; reseller_id: string; name: string; recipient: string;
 reply_to: string; reseller_name: string; version: string;
 lines: Array<{connection_number: number; username: string; password: string; m3u_url: string; expiration_date: string}>;
};
export const sender = 'noreply@eztvclub.com';
const mailbox = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function setupMessage(data: SetupData) {
 if (!mailbox.test(data.recipient) || !mailbox.test(data.reply_to) || data.recipient.length>254 || data.reply_to.length>254) throw new Error('invalid_recipient');
 if (!data.lines?.length || data.lines.length>20) throw new Error('no_current_connections');
 const parts = [`Hello ${data.name},`, '', 'Your EZTV account setup details are below.', ''];
 for (const line of data.lines) {
  if (!line.username || !line.password || /[\r\n]/.test(line.username+line.password)) throw new Error('credentials_need_review');
  const playlist = new URL(line.m3u_url);
  if (!['http:','https:'].includes(playlist.protocol) || playlist.username || playlist.password) throw new Error('setup_url_invalid');
  // Saved URLs can lag behind credential edits. Use the current canonical login.
  playlist.searchParams.set('username',line.username); playlist.searchParams.set('password',line.password);
  parts.push(`Connection ${line.connection_number}`, `Server URL: ${playlist.origin}`, `Username: ${line.username}`, `Password: ${line.password}`, `Expiration date: ${line.expiration_date}`, `M3U playlist: ${playlist.href}`, '');
 }
 parts.push('In your compatible streaming app, choose the login method provided by your reseller. For an Xtream Codes login, enter the server URL, username and password. For a playlist login, paste the M3U playlist URL.', '', `For setup help or renewals, reply to reach ${data.reseller_name || 'your reseller'} at ${data.reply_to}.`, '', 'Keep these login details private.', 'EZTV');
 const text=parts.join('\n');
 if(text.length>50000) throw new Error('message_too_large');
 return {from:{name:'EZTV',address:sender},to:data.recipient,replyTo:data.reply_to,subject:'Your EZTV account setup details',text,
  html:`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033"><h1 style="font-size:24px">Your EZTV setup details</h1><div style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6">${escape(text)}</div></body></html>`};
}
