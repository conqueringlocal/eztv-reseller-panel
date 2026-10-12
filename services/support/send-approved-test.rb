# One explicitly approved external test, sent through Zammad's actual article job.
# Run via send-approved-test.py, which writes a durable attempt marker first.
require 'json'
raise 'Private pilot only' unless ENV['EZTV_SUPPORT_PILOT'] == 'true' && Setting.get('fqdn') == 'localhost:8093'
raise 'Channels/triggers must remain off' if Channel.where(active: true).any? || Trigger.where(active: true).any?
ActiveRecord::Base.logger = Logger.new(File::NULL)
Rails.logger.level = Logger::ERROR
request = JSON.parse($stdin.read)
recipient = request.fetch('recipient')
nonce = request.fetch('nonce')
raise 'Invalid recipient' unless recipient.match?(/\A[a-zA-Z0-9._+%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\z/)
raise 'Invalid test marker' unless nonce.match?(/\A[a-f0-9]{24}\z/)
raise 'Explicit approved-test mode required' unless request['approved_test'] == true
title = "EZTV support setup test #{nonce}"
raise 'Test already exists; inspect it rather than sending again' if Ticket.exists?(title: title)
UserInfo.current_user_id = 1
group = Group.find_by!(name: 'Technical Support')
previous_address = group.email_address_id
channel = Channel.where(area: 'Email::Account').find { |c| c.options.dig(:inbound, :options, :user) == 'support@eztvclub.com' }
raise 'Missing safe mailbox channel' unless channel && !channel.active &&
  channel.options.dig(:inbound, :options, :folder) == 'EZTV-Support-Pilot' &&
  channel.options.dig(:inbound, :options, :keep_on_server) == true &&
  channel.options.dig(:outbound, :options, :ssl_verify) == true
address = EmailAddress.find_by!(email: 'support@eztvclub.com')
raise 'Sender must be inactive and unlinked' if address.active || address.channel_id
agent = User.find_by!(login: 'agent@pilot.eztv.invalid')
customer = User.find_by(email: recipient)
unless customer
  customer = User.new(email: recipient, login: recipient, firstname: 'Mail delivery', lastname: 'test recipient',
    active: true, verified: false, created_by_id: 1, updated_by_id: 1)
  customer.roles = Role.where(name: 'Customer')
  customer.save!
end
raise 'Test recipient must have customer role only' unless customer.roles.pluck(:name) == ['Customer']
raise 'Test recipient must not share an organization' if customer.organization&.shared

# Capture callbacks in this process. Invoke exactly one delivery directly below;
# errors must not enqueue external retries in the real scheduler.
TicketArticleCommunicateEmailJob.queue_adapter = :test
begin
  channel.update!(active: true)
  address.update!(channel_id: channel.id, active: true)
  group.update!(email_address_id: address.id)
  ticket = Ticket.create!(title: title, group_id: group.id, customer_id: customer.id,
    state: Ticket::State.find_by!(name: 'new'), priority: Ticket::Priority.find_by!(name: '2 normal'),
    created_by_id: agent.id, updated_by_id: agent.id)
  UserInfo.current_user_id = agent.id
  Ticket::Article.create!(ticket_id: ticket.id, type: Ticket::Article::Type.find_by!(name: 'note'),
    sender: Ticket::Article::Sender.find_by!(name: 'Agent'), internal: true, content_type: 'text/plain',
    body: "STAFF-ONLY-#{nonce}: delivery test; no customer action required.", created_by_id: agent.id, updated_by_id: agent.id)
  article = Ticket::Article.create!(ticket_id: ticket.id, type: Ticket::Article::Type.find_by!(name: 'email'),
    sender: Ticket::Article::Sender.find_by!(name: 'Agent'), internal: false,
    from: 'EZTV Support <support@eztvclub.com>', to: recipient, subject: title,
    body: request.fetch('body'), content_type: 'text/plain', created_by_id: agent.id, updated_by_id: agent.id)
  Store.create!(object: 'Ticket::Article', o_id: article.id, data: "EZTV support attachment test. No customer data.\n",
    filename: 'eztv-support-test.txt', preferences: { 'Content-Type' => 'text/plain' }, created_by_id: agent.id)
  TicketArticleCommunicateEmailJob.new.perform(article.id)
  raise 'SMTP acceptance not confirmed' unless article.reload.preferences['delivery_status'] == 'success'
  puts 'EZTV_APPROVED_TEST=' + JSON.generate({ ticket_id: ticket.id, ticket_number: ticket.number,
    article_id: article.id, recipient: recipient, smtp_accepted: true, inbox_delivery_confirmed: false,
    sent_at: Time.now.utc.iso8601, nonce: nonce })
ensure
  UserInfo.current_user_id = 1
  # Unlink first: Zammad otherwise reactivates an address linked to any channel.
  group.update!(email_address_id: previous_address)
  address.update!(channel_id: nil, active: false)
  channel.update!(active: false)
end
