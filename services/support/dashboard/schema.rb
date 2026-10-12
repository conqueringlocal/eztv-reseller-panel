# Additive adapter tables only. Run with rails runner on the private helpdesk.
raise 'Expected support instance' unless ENV['EZTV_SUPPORT_PILOT'] == 'true'
ActiveRecord::Schema.define do
 unless table_exists?(:eztv_support_identities)
  create_table :eztv_support_identities, id: :uuid do |t|
   t.bigint :user_id, null: false
   t.timestamps
  end
  add_index :eztv_support_identities, :user_id, unique: true
 end
 unless table_exists?(:eztv_support_tickets)
  create_table :eztv_support_tickets, id: :uuid do |t|
   t.bigint :ticket_id, null: false
   t.uuid :creator_id, null: false
   t.uuid :handler_id
   t.uuid :source_id
   t.string :category, null: false
   t.timestamps
  end
  add_index :eztv_support_tickets, :ticket_id, unique: true
  add_index :eztv_support_tickets, :creator_id
  add_index :eztv_support_tickets, [:handler_id, :creator_id]
  add_index :eztv_support_tickets, :source_id, unique: true, where: 'source_id IS NOT NULL'
 end
 unless table_exists?(:eztv_support_requests)
  create_table :eztv_support_requests, id: :uuid do |t|
   t.uuid :actor_id, null: false
   t.string :digest, null: false
   t.jsonb :result, null: false
   t.timestamps
  end
  add_index :eztv_support_requests, [:actor_id, :created_at]
 end
end
