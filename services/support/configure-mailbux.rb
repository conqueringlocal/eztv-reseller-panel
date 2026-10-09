# Prepare an inactive mailbox channel. Credentials arrive on stdin, never in argv.
require 'json'
raise 'Private pilot only' unless ENV['EZTV_SUPPORT_PILOT'] == 'true' && Setting.get('fqdn') == 'localhost:8093'
raise 'Disable all channels and triggers first' if Channel.where(active: true).any? || Trigger.where(active: true).any?

credentials = JSON.parse(STDIN.read)
raise 'Unexpected mailbox configuration' unless credentials['email'] == 'support@eztvclub.com' &&
  credentials['folder'] == 'EZTV-Support-Pilot' && credentials['activate_channel'] == false
password = credentials.fetch('app_password')
raise 'Missing replacement credential' if password.empty? || password == 'REPLACE_WITH_NEW_MAILBUX_APP_PASSWORD'

# Suppress SQL diagnostics in this process; native channel permissions and masking
# protect the saved configuration. Do not dump Channel#options when inspecting it.
ActiveRecord::Base.logger = Logger.new(File::NULL)
Rails.logger.level = Logger::ERROR
UserInfo.current_user_id = 1
report = nil
ActiveRecord::Base.transaction do
  group = Group.find_by!(name: 'Technical Support')
  channels = Channel.where(area: 'Email::Account').select do |item|
    item.options.dig(:inbound, :options, :user) == credentials['email']
  end
  raise 'Multiple mailbox channels require review' if channels.length > 1
  channel = channels.first || Channel.new
  channel.assign_attributes(area: 'Email::Account', active: false, group_id: group.id,
    created_by_id: channel.created_by_id || 1, updated_by_id: 1,
    options: {
      inbound: { adapter: 'imap', options: {
        host: 'my.mailbux.com', port: 993, ssl: 'ssl', ssl_verify: true,
        user: credentials['email'], password: password,
        folder: 'EZTV-Support-Pilot', keep_on_server: true,
      } },
      outbound: { adapter: 'smtp', options: {
        host: 'my.mailbux.com', port: 587, ssl: false, ssl_verify: true,
        enable_starttls_auto: true, user: credentials['email'], password: password,
      } },
    })
  channel.save!
  address = EmailAddress.find_or_initialize_by(email: credentials['email'])
  raise 'Mailbox address belongs to another channel' if address.persisted? && address.channel_id && address.channel_id != channel.id
  # Zammad activates any address linked to an existing channel, even an inactive
  # channel. Leave the sender unlinked until the controlled activation step.
  address.assign_attributes(name: 'EZTV Support', channel_id: nil, active: false,
    created_by_id: address.created_by_id || 1, updated_by_id: 1)
  address.save!
  channel.reload
  raise 'Unexpected enabled channel' if channel.active || address.reload.active
  raise 'Folder preservation missing' unless channel.options.dig(:inbound, :options, :keep_on_server) == true
  raise 'TLS verification missing' unless channel.options.dig(:inbound, :options, :ssl_verify) == true &&
    channel.options.dig(:outbound, :options, :ssl_verify) == true
  report = { configured_at: Time.now.utc.iso8601, mailbox: credentials['email'], channel_id: channel.id,
    channel_active: false, sender_active: false, sender_linked: false, folder: 'EZTV-Support-Pilot', keep_on_server: true,
    messages_fetched: 0, messages_sent: 0, limitation: 'Inactive configuration only; container mail connectivity and delivery not tested.' }
end
puts 'EZTV_MAILBUX_CONFIG=' + JSON.generate(report)
