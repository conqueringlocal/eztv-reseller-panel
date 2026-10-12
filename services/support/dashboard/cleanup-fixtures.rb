# Delete only synthetic dashboard adapter fixtures, never native pilot/mail tests.
raise 'Explicit fixture cleanup flag required' unless ENV['EZTV_SUPPORT_FIXTURE_CLEANUP']=='true'
require 'json'
registered=JSON.parse(File.read('/tmp/eztv-support-fixtures.json'))
raise 'Invalid fixture registry' unless registered.is_a?(Array) && registered.all? { |id| id.match?(EztvSupport::UUID) }
identities=EztvSupport::Identity.where(id:registered)
raise 'Non-pilot identity' unless User.where(id:identities.pluck(:user_id)).all? { |u| u.firstname=='Pilot' }
ids=identities.pluck(:id)
records=EztvSupport::Record.where(creator_id:ids)
tickets=Ticket.where(id:records.pluck(:ticket_id))
raise 'Unexpected non-pilot title; manual review required' if tickets.any? { |t| !t.title.start_with?('PILOT ', 'Escalation: PILOT ') }
count=tickets.count
ActiveRecord::Base.transaction do
 if ActiveRecord::Base.connection.table_exists?(:eztv_support_notifications)
  notifications=EztvSupport::Notification.where(record_id:records.pluck(:id))
  notification_ids=notifications.pluck(:id).map { |id| ActiveRecord::Base.connection.quote(id) }
  ActiveRecord::Base.connection.execute("DELETE FROM eztv_support_deliveries WHERE notification_id IN (#{notification_ids.join(',')})") unless notification_ids.empty?
  notifications.delete_all
 end
 EztvSupport::Request.where(actor_id:ids).delete_all
 records.delete_all
 tickets.each(&:destroy!)
 User.where(id:identities.pluck(:user_id)).update_all(active:false)
end
puts "Removed #{count} synthetic adapter tickets; no production or email-test ticket selected."
