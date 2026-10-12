# Additive, safe to rerun; existing tickets keep their current conversation.
raise 'Expected support instance' unless ENV['EZTV_SUPPORT_PILOT']=='true'
ActiveRecord::Schema.define do
 unless column_exists?(:eztv_support_tickets,:waiting_on)
  add_column :eztv_support_tickets,:waiting_on,:string,null:false,default:'handler'
  execute <<~SQL
   UPDATE eztv_support_tickets r SET waiting_on=CASE WHEN a.sender_id=(SELECT id FROM ticket_article_senders WHERE name='Customer') THEN 'handler' ELSE 'requester' END
   FROM ticket_articles a WHERE a.id=(SELECT id FROM ticket_articles WHERE ticket_id=r.ticket_id AND internal=false ORDER BY created_at DESC,id DESC LIMIT 1)
  SQL
 end
 unless table_exists?(:eztv_support_notifications)
  create_table :eztv_support_notifications,id: :uuid do |t|
   t.uuid :record_id,null:false
   t.string :event_key,null:false
   t.string :audience,null:false
   t.string :status,null:false,default:'pending'
   t.timestamps
  end
  add_index :eztv_support_notifications,:event_key,unique:true
  add_index :eztv_support_notifications,[:status,:created_at]
 end
 unless table_exists?(:eztv_support_deliveries)
  create_table :eztv_support_deliveries,id: :uuid do |t|
   t.uuid :notification_id,null:false
   t.uuid :recipient_id,null:false
   t.string :status,null:false,default:'pending'
   t.integer :attempts,null:false,default:0
   t.string :last_error
   t.datetime :next_attempt_at
   t.datetime :sent_at
   t.timestamps
  end
  add_index :eztv_support_deliveries,[:notification_id,:recipient_id],unique:true,name:'eztv_support_delivery_unique'
 end
end
