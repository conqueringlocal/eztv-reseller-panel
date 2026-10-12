# Exercise real Mailbux IMAP fetching with synthetic mail in the dedicated folder.
# No SMTP delivery, INBOX access, or external recipient. Leave test mail preserved.
require 'json'
require 'net/imap'
require 'securerandom'
require 'openssl'
raise 'Private pilot only' unless ENV['EZTV_SUPPORT_PILOT'] == 'true' && Setting.get('fqdn') == 'localhost:8093'
raise 'Channels/triggers must remain off' if Channel.where(active: true).any? || Trigger.where(active: true).any?
ActiveRecord::Base.logger = Logger.new(File::NULL)
Rails.logger.level = Logger::ERROR
UserInfo.current_user_id = 1
channel = Channel.where(area: 'Email::Account').find do |item|
  item.options.dig(:inbound, :options, :user) == 'support@eztvclub.com'
end
raise 'Missing channel' unless channel
options = channel.options.fetch(:inbound).fetch(:options)
raise 'Unsafe folder or TLS settings' unless options[:folder] == 'EZTV-Support-Pilot' &&
  options[:keep_on_server] == true && options[:ssl_verify] == true && options[:host] == 'my.mailbux.com'
imap = nil
checks = []
check = lambda do |name, condition|
  raise "FAIL #{name}" unless condition
  checks << name
  puts "PASS #{name}"
end
begin
  imap = Net::IMAP.new(options[:host], port: 993, ssl: { verify_mode: OpenSSL::SSL::VERIFY_PEER })
  imap.login(options.fetch(:user), options.fetch(:password))
  imap.select(options[:folder])
  raise 'Unread mail already in test folder; review before running' unless imap.search(['UNSEEN']).empty?
  reseller = User.find_by!(login: 'reseller-a@pilot.eztv.invalid')
  other = User.find_by!(login: 'reseller-b@pilot.eztv.invalid')
  nonce = SecureRandom.hex(12)
  original_count = Ticket.count
  incoming = Mail.new do
    from reseller.email
    to 'support@eztvclub.com'
    subject "EZTV IMAP PILOT #{nonce}"
    message_id "eztv-imap-#{nonce}@pilot.eztv.invalid"
    text_part { body 'Synthetic live IMAP check. No real customer or credentials.' }
    add_file filename: 'synthetic-device.txt', content: 'EZTV SYNTHETIC ATTACHMENT'
  end
  incoming['X-Zammad-Customer-Email'] = other.email
  imap.append(options[:folder], incoming.to_s)
  check.call('Native IMAP driver fetch succeeds', channel.fetch(true) && channel.reload.status_in == 'ok')
  article = Ticket::Article.find_by!(message_id: "<#{incoming.message_id}>")
  ticket = article.ticket
  check.call('Live IMAP creates one ticket with correct reseller ownership', Ticket.count == original_count + 1 && ticket.customer_id == reseller.id)
  check.call('Untrusted ownership header ignored on real mailbox path', ticket.customer_id != other.id)
  check.call('Attachment content survives live mailbox import', article.attachments.any? { |file| file.filename == 'synthetic-device.txt' && file.content == 'EZTV SYNTHETIC ATTACHMENT' })
  # Refresh this second IMAP session after the driver changed flags separately.
  imap.select(options[:folder])
  # Mailbux returns no matches for HEADER Message-ID searches. Its SUBJECT
  # search works; the random marker selects only this test's message.
  ids = imap.search(['SUBJECT', nonce])
  check.call('Mail preserved and marked read', ids.one? && imap.fetch(ids, 'FLAGS').first.attr['FLAGS'].include?(:Seen))
  # A second mail client can mark an imported message unread. Message-ID must
  # prevent a duplicate ticket even when the native driver encounters it again.
  imap.store(ids, '-FLAGS', [:Seen])
  check.call('Unread replay fetched safely', channel.fetch(true))
  check.call('Re-fetch does not duplicate ticket or article', Ticket.count == original_count + 1 && Ticket::Article.where(message_id: "<#{incoming.message_id}>").count == 1)
  followup = Mail.new do
    from reseller.email
    to 'support@eztvclub.com'
    subject "Re: #{ticket.subject_build(incoming.subject)}"
    message_id "eztv-imap-followup-#{nonce}@pilot.eztv.invalid"
    in_reply_to incoming.message_id
    references [incoming.message_id]
    body 'Synthetic follow-up through live IMAP.'
  end
  imap.append(options[:folder], followup.to_s)
  check.call('Live follow-up fetch succeeds', channel.fetch(true))
  reply = Ticket::Article.find_by!(message_id: "<#{followup.message_id}>")
  check.call('Email follow-up stays on the same ticket and reseller', reply.ticket_id == ticket.id && reply.created_by_id == reseller.id && Ticket.count == original_count + 1)
  check.call('No automatic replies or external channels enabled', Channel.where(active: true).none? && Trigger.where(active: true).none? &&
    ticket.articles.none? { |item| item.sender.name != 'Customer' && item.type.name == 'email' })
  puts 'EZTV_LIVE_IMAP=' + JSON.generate({ tested_at: Time.now.utc.iso8601, passed: checks, ticket_id: ticket.id,
    synthetic_messages_appended: 2, external_messages_sent: 0, inbox_accessed: false, channel_active: false })
ensure
  imap&.logout rescue nil
  imap&.disconnect rescue nil
end
