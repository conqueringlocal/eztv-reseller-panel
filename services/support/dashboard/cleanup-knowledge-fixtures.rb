raise 'Explicit fixture cleanup required' unless ENV['EZTV_SUPPORT_FIXTURE_CLEANUP']=='true'
ids=JSON.parse(File.read('/tmp/knowledge-fixtures.json'))
actors=JSON.parse(File.read('/tmp/eztv-support-fixtures.json'))
raise 'Invalid registry' unless ids.all? { |id| id.match?(EztvSupport::UUID) } && actors.all? { |id| id.match?(EztvSupport::UUID) }
records=EztvSupport::KbArticle.where(id:ids)
raise 'Non-fixture author' unless records.all? { |r| actors.include?(r.updated_by) }
answers=KnowledgeBase::Answer.where(id:records.pluck(:answer_id))
raise 'Non-fixture article' unless answers.all? { |a| a.translations.all? { |t| t.title.start_with?('PILOT ') } }
count=records.count
ActiveRecord::Base.transaction do
 EztvSupport::KbWrite.where(article_id:ids).delete_all
 records.delete_all
 answers.each(&:destroy!)
end
puts "Removed #{count} registered knowledge-base fixtures."
