# Read-only TLS/authentication check through the fixed Mailbux gateway.
require 'json'
require 'net/imap'
require 'net/smtp'
require 'openssl'
require 'socket'
require 'timeout'

credentials = JSON.parse(STDIN.read)
raise 'Unexpected mailbox' unless credentials['email'] == 'support@eztvclub.com'
raise 'Unexpected folder' unless credentials['folder'] == 'EZTV-Support-Pilot'
report = { imap_login: false, smtp_login: false, test_folder_available: false,
           general_internet_blocked: false,
           messages_fetched: 0, messages_sent: 0 }
begin
  Timeout.timeout(50) do
    begin
      Socket.tcp('1.1.1.1', 443, connect_timeout: 2) { |socket| socket.close }
      raise 'Unexpected general outbound connectivity'
    rescue Errno::ENETUNREACH, Errno::EHOSTUNREACH, Errno::ETIMEDOUT, IO::TimeoutError
      report[:general_internet_blocked] = true
    end
    imap = Net::IMAP.new('my.mailbux.com', port: 993,
      ssl: { verify_mode: OpenSSL::SSL::VERIFY_PEER }, open_timeout: 15)
    begin
      imap.login(credentials.fetch('email'), credentials.fetch('app_password'))
      report[:imap_login] = true
      imap.examine('EZTV-Support-Pilot')
      report[:test_folder_available] = true
    ensure
      imap.logout rescue nil
      imap.disconnect rescue nil
    end
    smtp = Net::SMTP.new('my.mailbux.com', 587)
    smtp.open_timeout = 15
    smtp.read_timeout = 15
    context = OpenSSL::SSL::SSLContext.new
    context.set_params(verify_mode: OpenSSL::SSL::VERIFY_PEER)
    smtp.enable_starttls(context)
    smtp.start('eztvclub.com', credentials.fetch('email'), credentials.fetch('app_password'), :login) do
      report[:smtp_login] = true
    end
  end
  puts 'EZTV_CONTAINER_MAIL=' + JSON.generate(report)
rescue StandardError => error
  # Exception messages can include protocol payloads. Print only the class.
  warn "Mail connectivity check failed: #{error.class}"
  exit 1
end
