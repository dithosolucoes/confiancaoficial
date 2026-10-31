-- Cache de geocodificação (Nominatim/OpenStreetMap).
-- Guarda o resultado de cada endereço para não repetir pedidos à rede pública
-- (política de uso: máx. 1 pedido por segundo e cache obrigatório).
-- Acesso só pelo service role (Edge Functions); cliente final não lê nem escreve.

CREATE TABLE IF NOT EXISTS public.geocode_cache (
  address_key text PRIMARY KEY,
  address text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.geocode_cache FROM anon, authenticated;
