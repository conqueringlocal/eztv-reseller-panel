# Set up a native Zammad KB; dashboard metadata limits who can read each article.
raise 'Expected support instance' unless ENV['EZTV_SUPPORT_PILOT']=='true'
ActiveRecord::Schema.define do
 unless table_exists?(:eztv_knowledge_config)
  create_table :eztv_knowledge_config,id:false do |t|
   t.string :id,primary_key:true
   t.bigint :knowledge_base_id,null:false
   t.bigint :locale_id,null:false
  end
 end
 unless table_exists?(:eztv_knowledge_categories)
  create_table :eztv_knowledge_categories,id: :string do |t|
   t.bigint :category_id,null:false
   t.string :audience,null:false
   t.integer :position,null:false
  end
  add_index :eztv_knowledge_categories,:category_id,unique:true
 end
 unless table_exists?(:eztv_knowledge_articles)
  create_table :eztv_knowledge_articles,id: :uuid do |t|
   t.bigint :answer_id,null:false
   t.string :category_key,null:false
   t.string :status,null:false,default:'draft'
   t.integer :revision,null:false,default:1
   t.uuid :updated_by,null:false
   t.timestamps
  end
  add_index :eztv_knowledge_articles,:answer_id,unique:true
  add_index :eztv_knowledge_articles,[:category_key,:status]
 end
 unless table_exists?(:eztv_knowledge_writes)
  create_table :eztv_knowledge_writes,id: :uuid do |t|
   t.uuid :actor_id,null:false
   t.uuid :article_id,null:false
   t.string :digest,null:false
   t.timestamps
  end
 end
end
class KbSetupConfig < ActiveRecord::Base;self.table_name='eztv_knowledge_config';end
class KbSetupCategory < ActiveRecord::Base;self.table_name='eztv_knowledge_categories';end
ActiveRecord::Base.transaction do
 UserInfo.current_user_id=1
 config=KbSetupConfig.find_by(id:'main')
 unless config
  kb=KnowledgeBase.create!(active:false,iconset:'FontAwesome',color_highlight:'#4f46e5',color_header:'#ffffff',color_header_link:'#111827',homepage_layout:'grid',category_layout:'grid',kb_locales_attributes:[{system_locale_id:Locale.find_by!(locale:'en-us').id,primary:true}])
  locale=kb.kb_locales.first
  kb.translations.first.update!(title:'EZTV Help Center',footer_note:'For signed-in EZTV resellers')
  config=KbSetupConfig.create!(id:'main',knowledge_base_id:kb.id,locale_id:locale.id)
 end
 [
  ['getting-started','Getting started','reseller'],
  ['credits-renewals','Credits & renewals','reseller'],
  ['customer-setup','Customer setup','customer'],
  ['troubleshooting','Troubleshooting','customer'],
  ['support-requests','Support & requests','reseller'],
  ['sub-resellers','Sub-reseller management','reseller'],
  ['admin-guides','Private admin guides','admin']
 ].each_with_index do |(key,title,audience),position|
  next if KbSetupCategory.exists?(id:key)
  category=KnowledgeBase::Category.create!(knowledge_base_id:config.knowledge_base_id,category_icon:'f115',translations_attributes:[{title:title,kb_locale_id:config.locale_id}])
  KbSetupCategory.create!(id:key,category_id:category.id,audience:audience,position:position)
 end
end
puts 'Private native knowledge base and seven empty categories prepared.'
UserInfo.reset
