select policyname, cmd, qual
from pg_policies
where tablename = 'service_requests';