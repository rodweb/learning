deploy:
	supabase functions deploy telegram-handler --project-ref ivdntmralylsgxrqxfbq --no-verify-jwt
schema:
	set -a; . ./supabase/functions/.env; set +a; \
	supabase gen types typescript --db-url $$POSTGRES_URL > ./supabase/functions/telegram-handler/schema.ts