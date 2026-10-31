update profiles
set company_id = '11111111-1111-4111-8111-111111111111'
where user_id = (select id from auth.users where email = 'tecnico@teste.local');
