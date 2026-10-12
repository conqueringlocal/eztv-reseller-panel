# Import only the reply to the owner-approved test. No external mail is sent.
require 'json'
require 'net/imap'
require 'openssl'
raise 'Private pilot only' unless ENV['EZTV_SUPPORT_PILOT'] == 'true' && Setting.get('fqdn') == 'localhost:8093'
raise 'Channels/triggers must be off' if Channel.where(active: true).any? || Trigger.where(active: true).any?
ActiveRecord::Base.logger = Logger.new(File::NULL)
Rails.logger.level = Logger::ERROR
request = JSON.parse($stdin.read)
raise 'Expected accepted test' unless request['smtp_accepted'] == true && request['nonce'].match?(/\A[a-f0-9]{24}\z/)
ticket = Ticket.find(request.fetch('ticket_id'))
sent = ticket.articles.find(request.fetch('article_id'))
raise 'Unexpected test ticket' unless ticket.title == "EZTV support setup test #{request['nonce']}" &&
  ticket.customer.email == request['recipient'] && sent.to == request['recipient']
channel = Channel.where(area: 'Email::Account').find { |c| c.options.dig(:inbound, :options, :user) == 'support@eztvclub.com' }
raise 'Missing channel' unless channel
options = channel.options.fetch(:inbound).fetch(:options)
raise 'Unsafe mail configuration' unless options[:folder] == 'EZTV-Support-Pilot' && options[:host] == 'my.mailbux.com' &&
  options[:keep_on_server] == true && options[:ssl_verify] == true && !channel.active
imap = nil
begin
  imap = Net::IMAP.new(options[:host], port: 993, ssl: { verify_mode: OpenSSL::SSL::VERIFY_PEER })
  imap.login(options.fetch(:user), options.fetch(:password))
  imap.examine('INBOX')
  matches = imap.uid_search(['SUBJECT', request.fetch('nonce')])
  raise 'Unexpected number of subject matches' if matches.size > 10
  replies = matches.filter_map do |uid|
    item = imap.uid_fetch(uid, ['BODY.PEEK[HEADER]', 'RFC822.SIZE']).first
    header = Mail.new(item.attr.fetch('BODY[HEADER]'))
    references = [header.in_reply_to, *header.references].compact.flatten.map { |id| id.delete('<>') }
    next unless header.from == [request['recipient']] && (header.to || []).include?('support@eztvclub.com') &&
      references.include?(sent.message_id.delete('<>')) && header.message_id.present?
    raise 'Reply is above the pilot attachment limit' if item.attr.fetch('RFC822.SIZE') > 10 * 1024 * 1024
    [uid, header]
  end
  raise 'Expected exactly one approved-test reply; review before importing' unless replies.one?
  uid, header = replies.first
  message_id = "<#{header.message_id}>"
  article = Ticket::Article.find_by(message_id: message_id)
  already_imported = article.present?
  ticket_count = Ticket.count
  outbound_count = Ticket::Article.where(sender_id: Ticket::Article::Sender.find_by!(name: 'Agent').id,
    type_id: Ticket::Article::Type.find_by!(name: 'email').id).count
  unless article
    raw = imap.uid_fetch(uid, 'BODY.PEEK[]').first.attr.fetch('BODY[]')
    parsed = Mail.new(raw)
    raise 'Reply changed during fetch' unless parsed.message_id == header.message_id && parsed.from == header.from
    imap.select(options[:folder])
    copies = imap.search(['SUBJECT', request.fetch('nonce')]).select do |id|
      item = imap.fetch(id, 'BODY.PEEK[HEADER]').first
      Mail.new(item.attr.fetch('BODY[HEADER]')).message_id == header.message_id
    end
    raise 'Multiple test-folder copies need review' if copies.size > 1
    raise 'Unrelated unread mail in test folder; import refused' unless (imap.search(['UNSEEN']) - copies).empty?
    if copies.empty?
      imap.append(options[:folder], raw)
    else
      imap.store(copies, '-FLAGS', [:Seen])
    end
    UserInfo.current_user_id = 1
    raise 'Native IMAP import failed' unless channel.fetch(true) && channel.reload.status_in == 'ok'
    article = Ticket::Article.find_by!(message_id: message_id)
  end
  raise 'Reply did not thread onto the expected ticket' unless article.ticket_id == ticket.id && Ticket.count == ticket_count
  raise 'Reply identity mismatch' unless article.created_by_id == ticket.customer_id && article.sender.name == 'Customer' && !article.internal
  raise 'Duplicate reply articles' unless Ticket::Article.where(message_id: message_id).count == 1
  raise 'Unexpected outbound article' unless Ticket::Article.where(sender_id: Ticket::Article::Sender.find_by!(name: 'Agent').id,
    type_id: Ticket::Article::Type.find_by!(name: 'email').id).count == outbound_count
  raise 'Channel or trigger enabled' if Channel.where(active: true).any? || Trigger.where(active: true).any?
  puts 'EZTV_REPLY_RESULT=' + JSON.generate({ verified_at: Time.now.utc.iso8601, ticket_number: ticket.number,
    ticket_id: ticket.id, reply_article_id: article.id, correct_ticket: true, correct_customer: true,
    reply_attachments: article.attachments.count, already_imported: already_imported, duplicate_reply_count: 0,
    original_inbox_message_modified: false, external_messages_sent: 0, channel_active: false })
ensure
  imap&.logout rescue nil
  imap&.disconnect rescue nil
end
