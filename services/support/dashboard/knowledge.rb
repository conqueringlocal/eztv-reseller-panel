require 'cgi'
module EztvSupport
 class KbConfig < ActiveRecord::Base;self.table_name='eztv_knowledge_config';end
 class KbCategory < ActiveRecord::Base;self.table_name='eztv_knowledge_categories';end
 class KbArticle < ActiveRecord::Base;self.table_name='eztv_knowledge_articles';end
 class KbWrite < ActiveRecord::Base;self.table_name='eztv_knowledge_writes';end
 class Conflict < StandardError;end
 class Knowledge
  def initialize(service,actor)
   @service=service;@actor=actor;@admin=actor['admin']==true
   @config=KbConfig.find_by!(id:'main')
  end
  def categories
   scope=KbCategory.order(:position)
   @admin ? scope : scope.where.not(audience:'admin')
  end
  def scope
   # Native IDs alone never grant dashboard visibility. Require our allowlist,
   # the configured KB and locale, and matching native publication state.
   scope=KbArticle.joins('JOIN knowledge_base_answers a ON a.id=eztv_knowledge_articles.answer_id JOIN knowledge_base_categories c ON c.id=a.category_id JOIN eztv_knowledge_categories k ON k.category_id=c.id AND k.id=eztv_knowledge_articles.category_key JOIN knowledge_base_answer_translations tr ON tr.answer_id=a.id JOIN knowledge_base_answer_translation_contents co ON co.id=tr.content_id')
    .where('c.knowledge_base_id=? AND tr.kb_locale_id=?',@config.knowledge_base_id,@config.locale_id)
    .where(category_key:categories.select(:id))
   @admin ? scope : scope.where(status:'published').where('a.internal_at<=? AND a.archived_at IS NULL AND a.published_at IS NULL',Time.current)
  end
  def get(id)
   raise Invalid,'Choose an article' unless id.is_a?(String)&&id.match?(UUID)
   scope.find_by(id:id) || (raise Denied)
  end
  def describe(record,body:false)
   answer=KnowledgeBase::Answer.find(record.answer_id)
   translation=answer.translations.find_by!(kb_locale_id:@config.locale_id)
   result={id:record.id,title:translation.title,category:record.category_key,status:record.status,revision:record.revision,updated_at:record.updated_at.iso8601}
   result[:body]=CGI.unescapeHTML(translation.content.body_text_only) if body
   result
  end
  def call(action,input)
   return describe(get(input['id']),body:true) if action=='kb_detail'
   if action=='kb_list'
    records=scope
    category=input['category'].to_s
    unless category.empty?
     raise Denied unless categories.exists?(id:category)
     records=records.where(category_key:category)
    end
    search=input.fetch('q','')
    raise Invalid,'Search must be 120 characters or less' unless search.is_a?(String)&&search.size<=120
    unless search.strip.empty?
     term='%'+ActiveRecord::Base.sanitize_sql_like(search.strip)+'%'
     records=records.where('tr.title ILIKE ? OR co.body ILIKE ?',term,term)
    end
    if @admin && input['status'].present?
     raise Invalid,'Choose an article status' unless %w[draft published archived].include?(input['status'])
     records=records.where(status:input['status'])
    end
    offset=input.fetch('offset',0)
    raise Invalid,'Invalid page' unless offset.is_a?(Integer)&&offset.between?(0,10000)
    counts=scope.group(:category_key).count
    rows=records.order(updated_at: :desc,id: :asc).offset(offset).limit(51).to_a
    return {admin:@admin,categories:categories.map { |c| {id:c.id,title:KnowledgeBase::Category.find(c.category_id).translations.find_by!(kb_locale_id:@config.locale_id).title,audience:c.audience,count:counts[c.id]||0} },articles:rows.first(50).map { |r| describe(r) },more:rows.size>50}
   end
   raise Denied unless @admin
   raise Invalid,'Unsupported action' unless action=='kb_save'
   request_id=input['request_id'];id=input['id']
   raise Invalid,'Missing article or request reference' unless [id,request_id].all? { |v| v.is_a?(String)&&v.match?(UUID) }
   digest=Digest::SHA256.hexdigest(JSON.generate(input))
   ActiveRecord::Base.transaction do
    connection=KbArticle.connection
    connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(#{connection.quote('eztv-support:'+@actor['id'])},0))")
    connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(#{connection.quote('eztv-kb:'+id)},0))")
    previous=KbWrite.find_by(id:request_id)
    if previous
     raise Invalid,'Request reference already used' unless previous.actor_id==@actor['id']&&previous.digest==digest
     return describe(get(previous.article_id),body:true)
    end
    record=KbArticle.find_by(id:id)
    expected=input['revision']
    raise Conflict,'This article changed. Reload it before saving again.' unless expected.is_a?(Integer)&&expected==(record&.revision||0)
    category=categories.find_by(id:input['category']) || (raise Invalid,'Choose a category')
    status=input['status'];raise Invalid,'Choose an article status' unless %w[draft published archived].include?(status)
    title=@service.text(input,'title',180);body=@service.text(input,'body',50000)
    user=@service.native_user;UserInfo.current_user_id=user.id
    html=CGI.escapeHTML(body).gsub("\n",'<br>')
    answer=record ? KnowledgeBase::Answer.find(record.answer_id) : KnowledgeBase::Answer.new(category_id:category.category_id)
    answer.assign_attributes(category_id:category.category_id,published_at:nil,published_by_id:nil,internal_at:status=='published' ? Time.current : nil,internal_by_id:status=='published' ? user.id : nil,archived_at:status=='archived' ? Time.current : nil,archived_by_id:status=='archived' ? user.id : nil)
    if answer.new_record?
     answer.translations.build(title:title,kb_locale_id:@config.locale_id,content_attributes:{body:html},created_by_id:user.id,updated_by_id:user.id)
     answer.save!
    else
     answer.save!
     translation=answer.translations.find_by!(kb_locale_id:@config.locale_id)
     translation.update!(title:title,updated_by_id:user.id,content_attributes:{body:html})
    end
    attrs={answer_id:answer.id,category_key:category.id,status:status,revision:expected+1,updated_by:@actor['id']}
    record ? record.update!(attrs) : record=KbArticle.create!(attrs.merge(id:id))
    KbWrite.create!(id:request_id,actor_id:@actor['id'],article_id:record.id,digest:digest)
    describe(record,body:true)
   end
  rescue ActiveRecord::RecordInvalid
   raise Invalid,'The article could not be saved. Check the title and category; titles must be unique within a category.'
  ensure
   UserInfo.reset
  end
 end
end
