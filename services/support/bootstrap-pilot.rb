# Run only on the isolated pilot, after Zammad init succeeds.
require 'json'
raise 'Pilot only' unless ENV['EZTV_SUPPORT_PILOT'] == 'true'
raise 'Unexpected host' unless Setting.get('fqdn') == 'localhost:8093'
credentials = JSON.parse(File.read('/tmp/eztv-pilot-users.json'))
UserInfo.current_user_id = 1

# No invitations, external mail, webhooks or self-registration in the pilot.
Channel.all.each { |channel| channel.update!(active: false) }
Trigger.all.each { |trigger| trigger.update!(active: false) }
Organization.all.each { |org| org.update!(shared: false, domain_assignment: false) }
{
  'product_name' => 'EZTV Reseller Support — Private Pilot',
  'organization' => 'EZTV Reseller Support',
  'user_create_account' => false,
  'user_lost_password' => false,
  'api_password_access' => true,
  'api_token_access' => true,
  'customer_ticket_create' => true,
}.each do |name, value|
  raise "Unknown setting #{name}" unless Setting.exists?(name: name)
  Setting.set(name, value)
end

groups = ['Technical Support', 'Provisioning & Renewals', 'Provider Incidents'].map do |name|
  group = Group.find_or_initialize_by(name: name)
  group.assign_attributes(active: true, note: 'Private pilot queue. Credit purchases stay with the distributor.',
                          updated_by_id: 1, created_by_id: group.created_by_id || 1)
  group.save!
  group
end
Group.where.not(id: groups.map(&:id)).each { |group| group.update!(active: false) }
Setting.set('customer_ticket_create_group_ids', groups.map(&:id))

{
  'eztv-device-details' => 'Please send your customer reference, affected connection number, device, app, when the issue started (including timezone), and any error screenshot. Please remove passwords, payment details, and playlist URLs from screenshots.',
  'eztv-paid-action-review' => 'We are checking whether the provider completed this action. Please do not create or renew the account again while this ticket is under review. Include the dashboard operation reference and the approximate time of the attempt.',
  'eztv-credit-purchase' => 'For credit purchases and payment confirmation, please contact your distributor. If a confirmed credit allocation is missing or incorrect, send the request reference here so we can investigate the dashboard balance.',
  'eztv-provider-investigation' => 'We are investigating this service report. Please include the channel or event, time and timezone, device, and whether the problem affects one customer or several. We will update this ticket when we have a confirmed finding.'
}.each do |name, content|
  text = TextModule.find_or_initialize_by(name: name)
  text.assign_attributes(content: content, keywords: name, active: true,
                         updated_by_id: 1, created_by_id: text.created_by_id || 1)
  text.save!
end

ids = {}
credentials.each do |name, data|
  staff = ['admin', 'agent'].include?(name)
  org = nil
  unless staff
    org = Organization.find_or_initialize_by(name: "PILOT #{name}")
    org.assign_attributes(shared: false, domain_assignment: false, active: true,
                          note: 'Synthetic pilot organization; no customer or provider credentials.',
                          updated_by_id: 1, created_by_id: org.created_by_id || 1)
    org.save!
  end
  user = User.find_or_initialize_by(login: data.fetch('email'))
  user.assign_attributes(email: data.fetch('email'), firstname: 'PILOT', lastname: name,
                         password: data.fetch('password'), active: true, verified: true,
                         organization_id: org&.id, updated_by_id: 1, created_by_id: user.created_by_id || 1)
  user.roles = if name == 'admin'
                 Role.where(name: ['Admin', 'Agent'])
               elsif staff
                 Role.where(name: 'Agent')
               else
                 Role.where(name: 'Customer')
               end
  user.save!
  user.group_names_access_map = groups.to_h { |group| [group.name, ['full']] } if staff
  user.save!
  ids[name] = user.id
end

# Avoid leaving an upstream sample login enabled.
User.where.not(id: [1] + ids.values).each { |user| user.update!(active: false) }
Setting.set('system_init_done', true)
Setting.set('system_online_service', false)
puts JSON.generate({configured: true, user_ids: ids, groups: groups.map(&:name),
                    organizations_shared: Organization.where(shared: true, active: true).count,
                    active_channels: Channel.where(active: true).count})
