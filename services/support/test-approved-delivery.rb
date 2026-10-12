# Verify the exact one-shot send procedure through an isolated SMTP sink.
require 'json'
require 'stringio'
require 'securerandom'
require 'net/http'
raise 'Private pilot only' unless ENV['EZTV_SUPPORT_PILOT'] == 'true' && Setting.get('fqdn') == 'localhost:8093'
raise 'Channels/triggers must be off' if Channel.where(active: true).any? || Trigger.where(active: true).any?
channel = Channel.where(area: 'Email::Account').find { |c| c.options.dig(:inbound, :options, :user) == 'support@eztvclub.com' }
raise 'Prepare inactive Mailbux channel first' unless channel
original = channel.options.deep_dup
original_stdin = $stdin
nonce = SecureRandom.hex(12)
request = { recipient: 'reseller-a@pilot.eztv.invalid', nonce: nonce, approved_test: true,
            body: 'Synthetic approved-test delivery to isolated SMTP sink only.' }
begin
  changed = original.deep_dup
  changed[:outbound] = { adapter: 'smtp', options: { host: 'eztv-support-mail-sink', port: 1025,
    ssl: false, ssl_verify: true, enable_starttls_auto: false } }
  channel.update!(options: changed)
  $stdin = StringIO.new(JSON.generate(request))
  # Script reads $stdin so this test never requires replacing a process constant.
  load '/tmp/eztv-approved-test.rb'
  ticket = Ticket.find_by!(title: "EZTV support setup test #{nonce}")
  raise 'Channel left active' if channel.reload.active
  address = EmailAddress.find_by!(email: 'support@eztvclub.com')
  raise 'Sender left linked or active' if address.active || address.channel_id
  messages = JSON.parse(Net::HTTP.get(URI('http://eztv-support-mail-sink:8025/api/v1/messages'))).fetch('messages')
  matching = messages.select { |item| item.fetch('Subject').include?(nonce) }
  raise 'Expected exactly one captured email' unless matching.one?
  raw = Net::HTTP.get(URI("http://eztv-support-mail-sink:8025/api/v1/message/#{matching.first.fetch('ID')}/raw"))
  mail = Mail.new(raw)
  raise 'Wrong recipient or sender' unless mail.from == ['support@eztvclub.com'] && mail.to == ['reseller-a@pilot.eztv.invalid']
  raise 'Missing test attachment' unless mail.attachments.any? { |item| item.filename == 'eztv-support-test.txt' }
  raise 'Internal note leaked' if raw.include?("STAFF-ONLY-#{nonce}")
  raise 'Ticket reference missing' unless mail.subject.include?(ticket.number)
  # The same marker must not send twice, even if the external caller loses its response.
  $stdin = StringIO.new(JSON.generate(request))
  begin
    load '/tmp/eztv-approved-test.rb'
    raise 'Repeated send was not rejected'
  rescue RuntimeError => error
    raise unless error.message == 'Test already exists; inspect it rather than sending again'
  end
  raise 'Unexpected queued external email job' if Delayed::Job.where("handler LIKE '%TicketArticleCommunicateEmailJob%'").exists?
  puts 'PASS One-shot delivery: actual Zammad send, attachment, sender/recipient, ticket reference, no internal note, duplicate rejection, sender/channel restored, no background send queued.'
ensure
  $stdin = original_stdin
  channel.update!(active: false, options: original)
end
