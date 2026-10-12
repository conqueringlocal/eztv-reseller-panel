# This adapter never grants a reseller a native Zammad agent login.
require 'json'
require 'openssl'
require 'securerandom'
require 'base64'
module EztvSupport
 class Identity < ActiveRecord::Base; self.table_name = 'eztv_support_identities'; end
 class Record < ActiveRecord::Base; self.table_name = 'eztv_support_tickets'; end
 class Request < ActiveRecord::Base; self.table_name = 'eztv_support_requests'; end
 class Denied < StandardError; end
 class Invalid < StandardError; end
 CATEGORIES = %w[technical channel_issue channel_request vod_request].freeze
 UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i
 MIMES = %w[image/jpeg image/png image/webp application/pdf text/plain].freeze
 class Service
  def initialize(context)
   @actor=context.fetch('actor'); @id=@actor.fetch('id'); @children=context.fetch('children'); @admin=@actor['admin']==true
   raise Denied unless @id.match?(UUID) && @children.is_a?(Array) && @children.all? { |id| id.match?(UUID) }
   raise Denied if @actor['parent_id']==@id
  end
  def handles?(record)
   @admin || (record.handler_id==@id && @children.include?(record.creator_id))
  end
  def access?(record); record.creator_id==@id || handles?(record); end
  def get(id)
   raise Invalid, 'Choose a ticket' unless id.is_a?(String) && id.match?(UUID)
   record=Record.find_by(id: id)
   raise Denied unless record && access?(record)
   record
  end
  def native_user
   # Immutable UUID is the login key. Never match identities by an editable email.
   identity=Identity.find_by(id:@id)
   return User.find(identity.user_id) if identity
   user=User.new(login:"dashboard-#{@id}", email:"#{@id}@dashboard.eztv.invalid", firstname:@actor['name'].to_s[0,120],
     lastname:'', password:SecureRandom.hex(48), active:true, verified:true, created_by_id:1, updated_by_id:1)
   user.roles=Role.where(name:'Customer'); user.save!
   Identity.create!(id:@id,user_id:user.id)
   user
  end
  def summary(record)
   ticket=Ticket.find(record.ticket_id)
   escalation=Record.find_by(source_id:record.id)
   result={id:record.id,number:ticket.number,title:ticket.title,category:record.category,
    status:ticket.state.name=='closed' ? 'closed' : 'open',updated_at:ticket.updated_at.iso8601,
    mine:record.creator_id==@id,can_handle:handles?(record),escalated:escalation.present?,
    requester:[ticket.customer.firstname,ticket.customer.lastname].compact.join(' '),can_escalate:handles?(record) && !@admin && record.creator_id!=@id && !escalation}
   result[:escalation_id]=escalation.id if escalation && access?(escalation)
   source=Record.find_by(id:record.source_id) if record.source_id
   result[:source_id]=source.id if source && access?(source)
   result
  end
  def detail(record)
   data=summary(record)
   articles=Ticket::Article.where(ticket_id:record.ticket_id).order(:created_at,:id)
   articles=articles.where(internal:false) unless handles?(record)
   data.merge(messages:articles.map do |article|
    {id:article.id,body:article.body_as_text,author:article.created_by ? [article.created_by.firstname,article.created_by.lastname].compact.join(' ') : 'Support',
     internal:article.internal,created_at:article.created_at.iso8601,
     attachments:article.attachments.map { |file| {id:file.id,name:file.filename,size:file.size.to_i} }}
   end)
  end
  def text(input,key,max)
   value=input[key]
   raise Invalid, "Provide #{key}" unless value.is_a?(String) && value.strip.size.between?(1,max)
   value.strip
  end
  def files(input)
   list=input.fetch('attachments',[])
   raise Invalid, 'Use up to three attachments' unless list.is_a?(Array) && list.size<=3
   list.map do |item|
    raise Invalid, 'Unsupported attachment' unless item.is_a?(Hash) && MIMES.include?(item['type'])
    name=item['name'].to_s.gsub(/[^\p{L}\p{N}._ -]/,'_')[0,120]
    raise Invalid, 'Invalid attachment name' if name.empty? || name.start_with?('.')
    begin; data=Base64.strict_decode64(item.fetch('data')); rescue; raise Invalid, 'Invalid attachment'; end
    raise Invalid, 'Each attachment must be 1 MB or smaller' unless data.bytesize.between?(1,1024*1024)
    {name:name,data:data,type:item['type']}
   end
  end
  def article(record,user,body,internal:false,attachments:[])
   item=Ticket::Article.create!(ticket_id:record.ticket_id,body:body,content_type:'text/plain',internal:internal,
    type:Ticket::Article::Type.find_by!(name:'web'),sender:Ticket::Article::Sender.find_by!(name:record.creator_id==@id ? 'Customer' : 'Agent'),
    created_by_id:user.id,updated_by_id:user.id)
   attachments.each { |file| Store.create!(object:'Ticket::Article',o_id:item.id,data:file[:data],filename:file[:name],
     preferences:{'Content-Type'=>file[:type]},created_by_id:user.id) }
   item
  end
  def create(input,user,source:nil)
   category=source ? source.category : input['category']
   raise Invalid, 'Choose a ticket category' unless CATEGORIES.include?(category)
   title=source ? "Escalation: #{Ticket.find(source.ticket_id).title}"[0,160] : text(input,'title',160)
   body=text(input,'body',10000); attachments=files(input)
   ticket=Ticket.create!(title:title,group:Group.find_by!(name:'Technical Support'),customer_id:user.id,
    state:Ticket::State.find_by!(name:'new'),priority:Ticket::Priority.find_by!(name:'2 normal'),created_by_id:user.id,updated_by_id:user.id)
   record=Record.create!(id:SecureRandom.uuid,ticket_id:ticket.id,creator_id:@id,handler_id:@actor['parent_id'],source_id:source&.id,category:category)
   article(record,user,body,attachments:attachments)
   detail(record)
  end
  def call(action,input)
   if action=='list'
    scope=input.fetch('scope',@admin ? 'queue' : 'mine')
    records=case scope
     when 'mine' then Record.where(creator_id:@id)
     when 'queue' then @admin ? Record.where(handler_id:nil) : Record.where(handler_id:@id,creator_id:@children)
     when 'oversight' then (raise Denied unless @admin; Record.all)
     else raise Invalid, 'Choose a ticket list'
    end
    offset=input.fetch('offset',0)
    raise Invalid, 'Invalid page' unless offset.is_a?(Integer) && offset.between?(0,10000)
    # Zammad touches its native ticket on replies, so sort by that timestamp.
    rows=records.joins('JOIN tickets ON tickets.id=eztv_support_tickets.ticket_id').order('tickets.updated_at DESC').offset(offset).limit(51).to_a
    return {tickets:rows.first(50).map { |r| summary(r) },more:rows.size>50}
   end
   record=get(input['id']) unless action=='create'
   return detail(record) if action=='detail'
   if action=='attachment'
    item=Ticket::Article.where(ticket_id:record.ticket_id).find_by(id:input['article_id'])
    raise Denied unless item && (!item.internal || handles?(record))
    file=item.attachments.find { |f| f.id==input['attachment_id'] }
    raise Denied unless file && file.size.to_i<=1024*1024
    return {name:file.filename,data:Base64.strict_encode64(file.content),type:'application/octet-stream'}
   end
   raise Invalid, 'Unsupported action' unless %w[create reply close reopen escalate].include?(action)
   request_id=input['request_id']; raise Invalid, 'Missing request reference' unless request_id.is_a?(String) && request_id.match?(UUID)
   digest=Digest::SHA256.hexdigest(JSON.generate([action,input]))
   ActiveRecord::Base.transaction do
    # Serialize each actor's identities, rate limits and request IDs. Separate ticket
    # locks below protect concurrent escalation/close/reply by different actors.
    Identity.connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(#{Identity.connection.quote('eztv-support:'+@id)},0))")
    previous=Request.find_by(id:request_id)
    if previous
     raise Invalid, 'Request reference already used' unless previous.actor_id==@id && previous.digest==digest
     # Re-check access before returning any previously saved private conversation.
     saved=get(previous.result.fetch('id'))
     return detail(saved)
    end
    raise Invalid, 'Please wait before sending more requests' if Request.where(actor_id:@id).where('created_at > ?',1.hour.ago).count>=100
    user=native_user; UserInfo.current_user_id=user.id
    record&.lock!
    result=case action
     when 'create' then (raise Denied if @admin; create(input,user))
     when 'reply'
      internal=input['internal']==true
      raise Denied if internal && !handles?(record)
      article(record,user,text(input,'body',10000),internal:internal,attachments:files(input))
      Ticket.find(record.ticket_id).update!(state:Ticket::State.find_by!(name:'open'),updated_by_id:user.id)
      detail(record)
     when 'close','reopen'
      Ticket.find(record.ticket_id).update!(state:Ticket::State.find_by!(name:action=='close' ? 'closed' : 'open'),updated_by_id:user.id)
      detail(record)
     when 'escalate'
      raise Denied unless handles?(record) && !@admin && record.creator_id!=@id
      existing=Record.find_by(source_id:record.id)
      existing ? detail(get(existing.id)) : create(input,user,source:record)
    end
    Request.create!(id:request_id,actor_id:@id,digest:digest,result:{id:result.fetch(:id)})
    result
   end
  ensure
   UserInfo.reset
  end
 end
 class Middleware
  def initialize(app); @app=app; end
  def call(env)
   return @app.call(env) unless env['PATH_INFO']=='/api/eztv_support'
   return response(405,{error:'Method not allowed'}) unless env['REQUEST_METHOD']=='POST'
   body=env['rack.input'].read(5*1024*1024+1)
   return response(413,{error:'Request too large'}) if body.bytesize>5*1024*1024
   key=File.read('/run/secrets/eztv-support-key').strip
   signature=env['HTTP_X_EZTV_SIGNATURE'].to_s
   expected=OpenSSL::HMAC.hexdigest('SHA256',key,body)
   return response(401,{error:'Unauthorized'}) unless signature.bytesize==expected.bytesize && ActiveSupport::SecurityUtils.secure_compare(signature,expected)
   request=JSON.parse(body)
   return response(401,{error:'Expired request'}) unless request['issued_at'].is_a?(Integer) && (Time.now.to_i-request['issued_at']).between?(-2,15)
   result=Rails.application.executor.wrap do
    ActiveRecord::Base.connection_pool.with_connection do
     begin
      TransactionDispatcher.reset
      result=Service.new(request.fetch('context')).call(request.fetch('action'),request.fetch('input',{}))
      TransactionDispatcher.commit(disable_notification:true)
      result
     ensure
      TransactionDispatcher.reset
      UserInfo.reset
     end
    end
   end
   response(200,result)
  rescue Denied
   response(403,{error:'This ticket is not available to your account'})
  rescue Invalid => e
   response(400,{error:e.message})
  rescue JSON::ParserError,KeyError,TypeError
   response(400,{error:'Invalid request'})
  rescue StandardError => e
   Rails.logger.error("EZTV support adapter: #{e.class}")
   response(503,{error:'Support request could not be confirmed. Retry using the same request reference.'})
  end
  def response(status,body); [status,{'content-type'=>'application/json','cache-control'=>'no-store'},[JSON.generate(body)]]; end
 end
end
Rails.application.config.middleware.insert_before(0,EztvSupport::Middleware)
