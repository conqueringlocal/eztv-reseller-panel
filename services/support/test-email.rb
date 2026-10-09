# Synthetic email processing and SMTP capture. No live mailbox is contacted.
require 'json'
require 'net/http'
require 'securerandom'
raise 'Private pilot only' unless ENV['EZTV_SUPPORT_PILOT'] == 'true' && Setting.get('fqdn') == 'localhost:8093'
raise 'External channels must be disabled first' unless Channel.where(active: true).none?
raise 'Triggers must be disabled first' unless Trigger.where(active: true).none?

checks = []
check = lambda do |name, condition|
  raise "FAIL #{name}" unless condition
  checks << name
  puts "PASS #{name}"
end
UserInfo.current_user_id = 1
group = Group.find_by!(name: 'Technical Support')
previous_address = group.email_address_id
reseller = User.find_by!(login: 'reseller-a@pilot.eztv.invalid')
agent = User.find_by!(login: 'agent@pilot.eztv.invalid')
other = User.find_by!(login: 'reseller-b@pilot.eztv.invalid')
nonce = SecureRandom.hex(8)
inbox = 'support@pilot.eztv.invalid'
channel = nil
address = nil

begin
  channel = Channel.all.find { |item| item.options.dig(:outbound, :options, :host) == 'eztv-support-mail-sink' } || Channel.new
  channel.assign_attributes(area: 'Email::Account', active: true, group_id: group.id,
                            created_by_id: 1, updated_by_id: 1,
                            options: {
                              inbound: { adapter: 'null', options: {} },
                              outbound: { adapter: 'smtp', options: {
                                host: 'eztv-support-mail-sink', port: 1025,
                                ssl: false, enable_starttls_auto: false,
                              } },
                            })
  channel.save!
  address = EmailAddress.find_or_initialize_by(email: inbox)
  address.assign_attributes(name: 'EZTV Synthetic Support', channel_id: channel.id,
                            active: true, created_by_id: address.created_by_id || 1, updated_by_id: 1)
  address.save!
  group.update!(email_address_id: address.id)
  # Inline only in this runner process, so the email callback is exercised once.
  TicketArticleCommunicateEmailJob.queue_adapter = :inline
  parser = Channel::EmailParser.new
  incoming = Mail.new do
    from reseller.email
    to inbox
    subject "PILOT email workflow #{nonce}"
    message_id "incoming-#{nonce}@pilot.eztv.invalid"
    text_part { body 'Synthetic device issue. No live customer credentials.' }
    add_file filename: 'device-details.txt', content: 'SYNTHETIC DEVICE DETAILS'
  end
  # Untrusted headers must not move ownership or priority into someone else's account.
  incoming['X-Zammad-Customer-Email'] = other.email
  before = Ticket.count
  ticket, article = parser.process(channel, incoming.to_s)
  check.call('Inbound email creates one ticket', Ticket.count == before + 1)
  check.call('Inbound sender maps to existing reseller', ticket.customer_id == reseller.id)
  check.call('Untrusted ownership header cannot impersonate another reseller', ticket.customer_id != other.id)
  check.call('Inbound email routes to technical support', ticket.group_id == group.id)
  check.call('Inbound attachment retained', article.attachments.any? { |file| file.filename == 'device-details.txt' })
  # Deduplication belongs to the IMAP fetch driver, before the raw parser runs.
  # Calling the raw parser twice would bypass that production guard.
  headers = Channel::Driver::Imap.parse_rfc822_headers(incoming.header.to_s)
  validator = Channel::Driver::BaseEmailInbound::MessageValidator.new(headers)
  check.call('IMAP fetch validator recognizes an already imported Message-ID', validator.already_imported?(true, channel))

  UserInfo.current_user_id = agent.id
  secret_marker = "STAFF-ONLY-#{nonce}"
  Ticket::Article.create!(ticket_id: ticket.id, type: Ticket::Article::Type.find_by!(name: 'note'),
                          sender: Ticket::Article::Sender.find_by!(name: 'Agent'), body: secret_marker,
                          content_type: 'text/plain', internal: true, created_by_id: agent.id, updated_by_id: agent.id)
  outbound = Ticket::Article.create!(ticket_id: ticket.id, type: Ticket::Article::Type.find_by!(name: 'email'),
                                    sender: Ticket::Article::Sender.find_by!(name: 'Agent'),
                                    from: inbox, to: reseller.email, subject: "PILOT reply #{nonce}",
                                    body: "PUBLIC REPLY #{nonce}: We are investigating.", content_type: 'text/plain',
                                    in_reply_to: incoming.message_id, internal: false,
                                    created_by_id: agent.id, updated_by_id: agent.id)
  check.call('Actual email article delivered through local SMTP sink', outbound.reload.preferences['delivery_status'] == 'success')
  base = 'http://eztv-support-mail-sink:8025'
  messages = JSON.parse(Net::HTTP.get(URI("#{base}/api/v1/messages"))).fetch('messages')
  matching = messages.select { |message| message.fetch('Subject').include?(nonce) }
  check.call('Exactly one outbound reply captured', matching.length == 1)
  raw = Net::HTTP.get(URI("#{base}/api/v1/message/#{matching.first.fetch('ID')}/raw"))
  captured = Mail.new(raw)
  check.call('Outbound sender and recipient are correct', captured.from == [inbox] && captured.to == [reseller.email])
  check.call('Ticket reference included in outgoing subject', captured.subject.include?(ticket.number))
  check.call('Internal note not included in outgoing message', !raw.include?(secret_marker))
  check.call('Reply retains email threading header', captured.in_reply_to == incoming.message_id)

  followup = Mail.new do
    from reseller.email
    to inbox
    subject "Re: #{captured.subject}"
    message_id "followup-#{nonce}@pilot.eztv.invalid"
    in_reply_to captured.message_id
    references [incoming.message_id, captured.message_id]
    body 'Synthetic customer response with additional device details.'
  end
  followed_ticket, followed_article = parser.process(channel, followup.to_s)
  check.call('Reseller email reply stays on original ticket', followed_ticket.id == ticket.id && Ticket.count == before + 1)
  check.call('Reply remains attributed to reseller', followed_article.created_by_id == reseller.id)
  puts 'EZTV_EMAIL_RESULT=' + JSON.generate({ tested_at: Time.now.utc.iso8601, passed: checks,
                                           ticket_id: ticket.id, live_mailbox_connected: false,
                                           limitations: ['No live IMAP authentication or fetching', 'No external email delivery or sender authentication tested'] })
ensure
  UserInfo.current_user_id = 1
  channel&.update!(active: false)
  group.update!(email_address_id: previous_address)
  address.update!(active: false) if address&.persisted?
end
